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

describe('UserVerificationService', () => {
  function createService() {
    const values: Partial<EnvironmentVariables> = {
      DISCORD_GUILD_ID: 'guild-id',
      VERIFICATION_CHANNEL_ID: '1566719152507330602',
      VERIFIED_ROLE_NAME: 'member',
    };
    const configService = {
      get: vi.fn((key: keyof EnvironmentVariables) => values[key]),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    const userUpsert = vi.fn();
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: userUpsert,
      },
      emailVerification: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    return {
      service: new UserVerificationService(configService, prisma),
      prisma,
      userUpsert,
    };
  }

  it('posts the Vietnamese verification button for a new member', async () => {
    const send = vi.fn();
    const { service } = createService();
    const verifiedRole = { id: 'verified-role-id', name: 'member' };
    const member = {
      id: 'user-id',
      user: { bot: false },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
      guild: {
        id: 'guild-id',
        roles: {
          fetch: vi
            .fn()
            .mockResolvedValue(new Map([[verifiedRole.id, verifiedRole]])),
        },
        channels: {
          fetch: vi.fn().mockResolvedValue({
            isSendable: () => true,
            send,
          }),
        },
      },
    } as unknown as GuildMember;

    await service.handleMemberJoin(member);

    const message = send.mock.calls[0][0];
    expect(message.content).toContain('<@user-id>');
    expect(message.components[0].components[0].data.label).toBe(
      'Xác thực người dùng',
    );
    expect(message.components[0].components[0].data.custom_id).toBe(
      'user-verification:start:user-id',
    );
  });

  it('prompts members who joined before the bot and lack the verified role', async () => {
    const send = vi.fn();
    const { service } = createService();
    const verifiedRole = { id: 'verified-role-id', name: 'member' };
    const guild = {
      id: 'guild-id',
      roles: {
        fetch: vi
          .fn()
          .mockResolvedValue(new Map([[verifiedRole.id, verifiedRole]])),
      },
      members: { fetch: vi.fn() },
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isSendable: () => true,
          send,
        }),
      },
    };
    const member = {
      id: 'existing-user-id',
      user: { bot: false },
      roles: {
        cache: {
          has: vi.fn().mockReturnValue(false),
        },
      },
      guild,
    };
    guild.members.fetch.mockResolvedValue(new Map([[member.id, member]]));

    await service.handleExistingGuildMembers(guild as unknown as Guild);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('<@existing-user-id>'),
      }),
    );
  });

  it('ignores existing members from guilds outside DISCORD_GUILD_ID', async () => {
    const { service } = createService();
    const fetchRoles = vi.fn();
    const fetchMembers = vi.fn();
    const guild = {
      id: 'another-guild-id',
      roles: { fetch: fetchRoles },
      members: { fetch: fetchMembers },
    } as unknown as Guild;

    await service.handleExistingGuildMembers(guild);

    expect(fetchRoles).not.toHaveBeenCalled();
    expect(fetchMembers).not.toHaveBeenCalled();
  });

  it('does not prompt existing members who already have the verified role', async () => {
    const send = vi.fn();
    const { service } = createService();
    const verifiedRole = { id: 'verified-role-id', name: 'member' };
    const guild = {
      id: 'guild-id',
      roles: {
        fetch: vi
          .fn()
          .mockResolvedValue(new Map([[verifiedRole.id, verifiedRole]])),
      },
      members: { fetch: vi.fn() },
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isSendable: () => true,
          send,
        }),
      },
    };
    const member = {
      id: 'verified-user-id',
      user: { bot: false },
      roles: {
        cache: {
          has: vi.fn((roleId: string) => roleId === verifiedRole.id),
        },
      },
      guild,
    };
    guild.members.fetch.mockResolvedValue(new Map([[member.id, member]]));

    await service.handleExistingGuildMembers(guild as unknown as Guild);

    expect(send).not.toHaveBeenCalled();
  });

  it('shows account name, phone, and CCCD fields in the modal', async () => {
    const { service } = createService();
    const showModal = vi.fn();
    const interaction = {
      customId: 'user-verification:start:user-id',
      isButton: () => true,
      inCachedGuild: () => true,
      showModal,
      guildId: 'guild-id',
      guild: {},
      user: { id: 'user-id' },
    } as unknown as ButtonInteraction;

    await service.handleInteraction(interaction);

    const modal = showModal.mock.calls[0][0] as ModalBuilder;
    expect(modal.toJSON()).toEqual(
      expect.objectContaining({
        custom_id: 'user-verification:details:user-id',
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

  it('rejects another user clicking a verification button privately', async () => {
    const { service } = createService();
    const reply = vi.fn();
    const showModal = vi.fn();
    const interaction = {
      customId: 'user-verification:start:target-user-id',
      isButton: () => true,
      inCachedGuild: () => true,
      showModal,
      reply,
      guildId: 'guild-id',
      guild: {},
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
      customId: 'user-verification:details:target-user-id',
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
      customId: 'user-verification:details:user-id',
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

  it('rejects a CCCD with an unknown province code privately', async () => {
    const { service } = createService();
    const reply = vi.fn();
    const interaction = {
      customId: 'user-verification:details:user-id',
      isButton: () => false,
      isModalSubmit: () => true,
      inCachedGuild: () => true,
      fields: {
        getTextInputValue: (id: string) =>
          id === 'phone' ? '0912345678' : '003153000257',
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

  it('normalizes and saves the account name with the user record', async () => {
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
      customId: 'user-verification:details:user-id',
      isButton: () => false,
      isModalSubmit: () => true,
      inCachedGuild: () => true,
      fields: {
        getTextInputValue: (id: string) => values[id],
      },
      deferred: false,
      replied: false,
      deferReply: vi.fn(),
      editReply: vi.fn(),
      guildId: 'guild-id',
      guild,
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
