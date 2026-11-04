import { ConfigService } from '@nestjs/config';
import {
  MessageFlags,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type ModalBuilder,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { EnvironmentVariables } from '../config/environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { UserVerificationService } from './user-verification.service.js';

const CHANNEL_ID = '1566719152507330602';
const PANEL_BUTTON_ID = 'user-verification:panel';

describe('UserVerificationService', () => {
  function createService(
    overrides: Partial<EnvironmentVariables> = {},
    { registered = false } = {},
  ) {
    const values: Partial<EnvironmentVariables> = {
      DISCORD_GUILD_ID: 'guild-id',
      VERIFICATION_CHANNEL_ID: CHANNEL_ID,
      VERIFIED_ROLE_NAME: 'member',
      ...overrides,
    };
    const configService = {
      get: vi.fn((key: keyof EnvironmentVariables) => values[key]),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    const userUpsert = vi.fn();
    const userFindUnique = vi
      .fn()
      .mockResolvedValue(registered ? { id: 1, accountName: 'A' } : null);
    const promptUpsert = vi.fn();
    const prisma = {
      user: {
        findUnique: userFindUnique,
        upsert: userUpsert,
      },
      emailVerification: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      verificationPrompt: {
        upsert: promptUpsert,
      },
    } as unknown as PrismaService;

    return {
      service: new UserVerificationService(configService, prisma),
      userFindUnique,
      userUpsert,
      promptUpsert,
    };
  }

  /** A guild with one human member and a sendable verification channel. */
  function createGuild({
    memberHasRole = false,
    recentMessages = [] as unknown[],
  } = {}) {
    const verifiedRole = {
      id: 'verified-role-id',
      name: 'member',
      managed: false,
      position: 1,
    };
    const channelSend = vi.fn();
    const channel = {
      id: CHANNEL_ID,
      isTextBased: () => true,
      isSendable: () => true,
      send: channelSend,
      messages: { fetch: vi.fn().mockResolvedValue(recentMessages) },
    };
    const fetchChannel = vi.fn().mockResolvedValue(channel);
    const guild = {
      id: 'guild-id',
      name: 'Test Guild',
      client: { user: { id: 'bot-id' } },
      roles: {
        fetch: vi
          .fn()
          .mockResolvedValue(new Map([[verifiedRole.id, verifiedRole]])),
      },
      members: {
        fetch: vi.fn(),
        me: {
          permissions: { has: vi.fn().mockReturnValue(true) },
          roles: { highest: { position: 2 } },
        },
      },
      channels: { fetch: fetchChannel },
    };
    const addRole = vi.fn();
    const directMessage = vi.fn();
    const member = {
      id: 'user-id',
      user: { bot: false },
      send: directMessage,
      roles: {
        cache: {
          has: vi.fn(
            (roleId: string) => memberHasRole && roleId === verifiedRole.id,
          ),
        },
        add: addRole,
      },
      guild,
    };
    guild.members.fetch.mockResolvedValue(new Map([[member.id, member]]));

    return {
      guild,
      member,
      channelSend,
      fetchChannel,
      addRole,
      directMessage,
      verifiedRole,
    };
  }

  describe('new members', () => {
    it('mentions a new member in the verification channel with the shared button and never DMs', async () => {
      const { service, promptUpsert } = createService();
      const { member, channelSend, fetchChannel, directMessage } =
        createGuild();

      await service.handleMemberJoin(member as unknown as GuildMember);

      expect(directMessage).not.toHaveBeenCalled();
      expect(fetchChannel).toHaveBeenCalledWith(CHANNEL_ID);
      const message = channelSend.mock.calls[0][0];
      expect(message.content).toContain('<@user-id>');
      expect(message.content).toContain('Test Guild');
      expect(message.allowedMentions).toEqual({ users: ['user-id'] });
      expect(message.components[0].components[0].data).toMatchObject({
        custom_id: PANEL_BUTTON_ID,
        label: 'Xác thực người dùng',
      });
      expect(promptUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            guildId: 'guild-id',
            discordUserId: 'user-id',
            deliveredVia: 'CHANNEL',
          },
        }),
      );
    });

    it('sends and records nothing when no verification channel is configured', async () => {
      const { service, promptUpsert } = createService({
        VERIFICATION_CHANNEL_ID: undefined,
      });
      const { member, channelSend, directMessage } = createGuild();

      await service.handleMemberJoin(member as unknown as GuildMember);

      expect(channelSend).not.toHaveBeenCalled();
      expect(directMessage).not.toHaveBeenCalled();
      expect(promptUpsert).not.toHaveBeenCalled();
    });

    it('restores the role of a registered member who rejoins without prompting', async () => {
      const { service } = createService({}, { registered: true });
      const { member, channelSend, addRole, verifiedRole } = createGuild();

      await service.handleMemberJoin(member as unknown as GuildMember);

      expect(addRole).toHaveBeenCalledWith(
        verifiedRole,
        'Restored registered member role',
      );
      expect(channelSend).not.toHaveBeenCalled();
    });
  });

  describe('startup scan', () => {
    it('posts the shared verification panel and never messages members individually', async () => {
      const { service, promptUpsert } = createService();
      const { guild, channelSend, directMessage } = createGuild();

      await service.handleExistingGuildMembers(guild as unknown as Guild);

      expect(directMessage).not.toHaveBeenCalled();
      expect(channelSend).toHaveBeenCalledTimes(1);
      const panel = channelSend.mock.calls[0][0];
      expect(panel.content).not.toContain('<@');
      expect(panel.allowedMentions).toEqual({ parse: [] });
      expect(panel.components[0].components[0].data).toMatchObject({
        custom_id: PANEL_BUTTON_ID,
        label: 'Xác thực người dùng',
      });
      expect(promptUpsert).not.toHaveBeenCalled();
    });

    it('does not post a second panel when the bot already posted one', async () => {
      const { service } = createService();
      const existingPanel = {
        author: { id: 'bot-id' },
        components: [{ components: [{ customId: PANEL_BUTTON_ID }] }],
      };
      const { guild, channelSend } = createGuild({
        recentMessages: [existingPanel],
      });

      await service.handleExistingGuildMembers(guild as unknown as Guild);

      expect(channelSend).not.toHaveBeenCalled();
    });

    it('restores the role of registered members on startup', async () => {
      const { service } = createService({}, { registered: true });
      const { guild, addRole, verifiedRole } = createGuild();

      await service.handleExistingGuildMembers(guild as unknown as Guild);

      expect(addRole).toHaveBeenCalledWith(
        verifiedRole,
        'Restored registered member role',
      );
    });

    it('ignores guilds outside DISCORD_GUILD_ID', async () => {
      const { service } = createService();
      const fetchRoles = vi.fn();
      const fetchMembers = vi.fn();
      const fetchChannel = vi.fn();
      const guild = {
        id: 'another-guild-id',
        roles: { fetch: fetchRoles },
        members: { fetch: fetchMembers },
        channels: { fetch: fetchChannel },
      } as unknown as Guild;

      await service.handleExistingGuildMembers(guild);

      expect(fetchRoles).not.toHaveBeenCalled();
      expect(fetchMembers).not.toHaveBeenCalled();
      expect(fetchChannel).not.toHaveBeenCalled();
    });
  });

  describe('buttons in the server', () => {
    function createPanelClick(
      memberHasRole: boolean,
      customId: string = PANEL_BUTTON_ID,
    ) {
      const { guild, verifiedRole } = createGuild();
      const showModal = vi.fn();
      const reply = vi.fn();
      const interaction = {
        customId,
        isButton: () => true,
        inCachedGuild: () => true,
        showModal,
        reply,
        guildId: 'guild-id',
        guild,
        member: {
          roles: {
            cache: {
              has: (roleId: string) =>
                memberHasRole && roleId === verifiedRole.id,
            },
          },
        },
        user: { id: 'clicking-user-id' },
      } as unknown as ButtonInteraction;

      return { interaction, showModal, reply };
    }

    it('opens a form bound to whoever clicks the shared panel button', async () => {
      const { service } = createService();
      const { interaction, showModal } = createPanelClick(false);

      await service.handleInteraction(interaction);

      const modal = showModal.mock.calls[0][0] as ModalBuilder;
      expect(modal.toJSON().custom_id).toBe(
        'user-verification:details:guild-id:clicking-user-id',
      );
    });

    it('tells an already verified member privately instead of opening the form', async () => {
      const { service } = createService();
      const { interaction, showModal, reply } = createPanelClick(true);

      await service.handleInteraction(interaction);

      expect(showModal).not.toHaveBeenCalled();
      expect(reply).toHaveBeenCalledWith({
        content: 'Bạn đã được xác thực và có vai trò **member** rồi.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('does not reopen the form for a user already stored in the database', async () => {
      const { service, userFindUnique } = createService(
        {},
        { registered: true },
      );
      const { interaction, showModal, reply } = createPanelClick(false);

      await service.handleInteraction(interaction);

      expect(showModal).not.toHaveBeenCalled();
      expect(userFindUnique).toHaveBeenCalledWith({
        where: {
          guildId_discordUserId: {
            guildId: 'guild-id',
            discordUserId: 'clicking-user-id',
          },
        },
        select: { id: true },
      });
      expect(reply).toHaveBeenCalledWith({
        content: 'Bạn đã xác thực rồi, không cần xác thực lại',
        flags: MessageFlags.Ephemeral,
      });
    });

    it.each([
      'user-verification:start:guild-id:another-user-id',
      'user-verification:start',
      'email-verification:start',
    ])(
      'opens the form for the clicker on an older prompt bound to someone else: %s',
      async (customId) => {
        const { service } = createService();
        const { interaction, showModal, reply } = createPanelClick(
          false,
          customId,
        );

        await service.handleInteraction(interaction);

        expect(reply).not.toHaveBeenCalled();
        const modal = showModal.mock.calls[0][0] as ModalBuilder;
        expect(modal.toJSON().custom_id).toBe(
          'user-verification:details:guild-id:clicking-user-id',
        );
      },
    );
  });

  it('shows account name, phone, and CCCD fields in the modal (DM button)', async () => {
    const { service } = createService();
    const showModal = vi.fn();
    const interaction = {
      customId: 'user-verification:start:guild-id:user-id',
      isButton: () => true,
      inCachedGuild: () => false,
      showModal,
      guildId: null,
      guild: null,
      user: { id: 'user-id' },
    } as unknown as ButtonInteraction;

    await service.handleInteraction(interaction);

    const modal = showModal.mock.calls[0][0] as ModalBuilder;
    expect(modal.toJSON()).toEqual(
      expect.objectContaining({
        custom_id: 'user-verification:details:guild-id:user-id',
        components: [
          expect.objectContaining({
            components: [
              expect.objectContaining({
                custom_id: 'account_name',
                label: 'Tên tài khoản',
              }),
            ],
          }),
          expect.objectContaining({
            components: [expect.objectContaining({ custom_id: 'phone' })],
          }),
          expect.objectContaining({
            components: [expect.objectContaining({ custom_id: 'cccd' })],
          }),
        ],
      }),
    );
  });

  it('rejects a DM button whose recipient does not match the clicker', async () => {
    const { service } = createService();
    const reply = vi.fn();
    const showModal = vi.fn();
    const interaction = {
      customId: 'user-verification:start:guild-id:target-user-id',
      isButton: () => true,
      inCachedGuild: () => false,
      showModal,
      reply,
      guildId: null,
      guild: null,
      user: { id: 'different-user-id' },
    } as unknown as ButtonInteraction;

    await service.handleInteraction(interaction);

    expect(showModal).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content: 'Bạn không có quyền nhấn nút xác thực này',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('rejects another user submitting a user-bound verification modal', async () => {
    const { service, userUpsert } = createService();
    const reply = vi.fn();
    const interaction = {
      customId: 'user-verification:details:guild-id:target-user-id',
      isButton: () => false,
      isModalSubmit: () => true,
      inCachedGuild: () => true,
      reply,
      guildId: 'guild-id',
      guild: {},
      user: { id: 'different-user-id' },
    } as unknown as ModalSubmitInteraction;

    await service.handleInteraction(interaction);

    expect(userUpsert).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content: 'Bạn không có quyền nhấn nút xác thực này',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('rejects an invalid Vietnamese phone number privately', async () => {
    const { service } = createService();
    const reply = vi.fn();
    const interaction = {
      customId: 'user-verification:details:guild-id:user-id',
      isButton: () => false,
      isModalSubmit: () => true,
      inCachedGuild: () => true,
      fields: {
        getTextInputValue: (id: string) =>
          id === 'phone' ? '123' : '012345678901',
      },
      deferred: false,
      replied: false,
      reply,
      guildId: 'guild-id',
      guild: {},
      user: { id: 'user-id' },
    } as unknown as ModalSubmitInteraction;

    await service.handleInteraction(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'Số điện thoại không hợp lệ tại Việt Nam.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('rejects a structurally invalid CCCD privately', async () => {
    const { service } = createService();
    const reply = vi.fn();
    const interaction = {
      customId: 'user-verification:details:guild-id:user-id',
      isButton: () => false,
      isModalSubmit: () => true,
      inCachedGuild: () => true,
      fields: {
        getTextInputValue: (id: string) =>
          id === 'phone' ? '0912345678' : '03715300025A',
      },
      deferred: false,
      replied: false,
      reply,
      guildId: 'guild-id',
      guild: {},
      user: { id: 'user-id' },
    } as unknown as ModalSubmitInteraction;

    await service.handleInteraction(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'Số căn cước công dân không đúng cấu trúc quy định.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('normalizes and saves a private-DM submission with the user record', async () => {
    const { service, userUpsert } = createService();
    const addRole = vi.fn();
    const role = {
      id: 'member-role-id',
      name: 'member',
      managed: false,
      position: 1,
    };
    const fetchMember = vi.fn();
    const guild = {
      id: 'guild-id',
      roles: {
        fetch: vi.fn().mockResolvedValue(new Map([[role.id, role]])),
      },
      members: {
        fetch: fetchMember,
        me: {
          permissions: { has: vi.fn().mockReturnValue(true) },
          roles: { highest: { position: 2 } },
        },
      },
    };
    const member = {
      guild,
      roles: {
        cache: { has: vi.fn().mockReturnValue(false) },
        add: addRole,
      },
    };
    fetchMember.mockResolvedValue(member);
    const values: Record<string, string> = {
      account_name: '  Nguyễn   Văn A  ',
      phone: '+84 912 345 678',
      cccd: '037153000257',
    };
    const interaction = {
      customId: 'user-verification:details:guild-id:user-id',
      isButton: () => false,
      isModalSubmit: () => true,
      inCachedGuild: () => false,
      fields: {
        getTextInputValue: (id: string) => values[id],
      },
      deferred: false,
      replied: false,
      deferReply: vi.fn(),
      editReply: vi.fn(),
      guildId: null,
      guild: null,
      client: {
        guilds: { fetch: vi.fn().mockResolvedValue(guild) },
      },
      user: { id: 'user-id' },
    } as unknown as ModalSubmitInteraction;

    await service.handleInteraction(interaction);

    expect(userUpsert).toHaveBeenCalledWith({
      where: {
        guildId_discordUserId: {
          guildId: 'guild-id',
          discordUserId: 'user-id',
        },
      },
      create: {
        accountName: 'Nguyễn Văn A',
        phone: '0912345678',
        cccd: '037153000257',
        guildId: 'guild-id',
        discordUserId: 'user-id',
        email: undefined,
      },
      update: {
        accountName: 'Nguyễn Văn A',
        phone: '0912345678',
        cccd: '037153000257',
        email: undefined,
      },
    });
    expect(addRole).toHaveBeenCalledWith(role, 'User information submitted');
  });
});
