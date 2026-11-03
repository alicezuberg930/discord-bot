import { ConfigService } from '@nestjs/config';
import {
  MessageFlags,
  type GuildMember,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { EnvironmentVariables } from '../config/environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { UserVerificationService } from './user-verification.service.js';

describe('UserVerificationService', () => {
  function createService() {
    const values: Partial<EnvironmentVariables> = {
      VERIFICATION_CHANNEL_ID: '1566719152507330602',
      VERIFIED_ROLE_NAME: 'member',
    };
    const configService = {
      get: vi.fn((key: keyof EnvironmentVariables) => values[key]),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
      emailVerification: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    return {
      service: new UserVerificationService(configService, prisma),
      prisma,
    };
  }

  it('posts the Vietnamese verification button for a new member', async () => {
    const send = vi.fn();
    const { service } = createService();
    const member = {
      id: 'user-id',
      user: { bot: false },
      roles: { cache: { size: 1 } },
      guild: {
        id: 'guild-id',
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
  });

  it('rejects an invalid Vietnamese phone number privately', async () => {
    const { service } = createService();
    const reply = vi.fn();
    const interaction = {
      customId: 'user-verification:details',
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
});
