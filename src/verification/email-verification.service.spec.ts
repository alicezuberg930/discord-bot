import { ConfigService } from '@nestjs/config';
import {
  MessageFlags,
  type GuildMember,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { EnvironmentVariables } from '../config/environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { EmailVerificationStatus } from '../generated/prisma/client.js';
import { EmailVerificationService } from './email-verification.service.js';

describe('EmailVerificationService', () => {
  const verificationChannelId = '1566719152507330602';

  function createService() {
    const values: Partial<EnvironmentVariables> = {
      DATABASE_ENABLED: false,
      VERIFICATION_CHANNEL_ID: verificationChannelId,
      VERIFIED_ROLE_NAME: 'member',
      EMAIL_OTP_TTL_SECONDS: 600,
      EMAIL_OTP_MAX_ATTEMPTS: 5,
      EMAIL_OTP_RESEND_SECONDS: 60,
    };
    const configService = {
      get: vi.fn((key: keyof EnvironmentVariables) => values[key]),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    const emailService = {
      isConfigured: vi.fn(() => false),
      sendVerificationCode: vi.fn(),
    } as unknown as EmailService;
    const prisma = {
      emailVerification: {
        upsert: vi.fn().mockResolvedValue({
          id: 'verification-id',
          status: EmailVerificationStatus.UNVERIFIED,
        }),
        update: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn(),
      },
    } as unknown as PrismaService;

    return new EmailVerificationService(configService, emailService, prisma);
  }

  it('posts a private-modal verification prompt for a new human member', async () => {
    const send = vi.fn();
    const service = createService();
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

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('<@user-id>'),
        components: expect.any(Array),
      }),
    );
  });

  it('does not prompt bots or members that already have another role', async () => {
    const service = createService();
    const fetch = vi.fn();
    const member = {
      id: 'user-id',
      user: { bot: true },
      roles: { cache: { size: 2 } },
      guild: { channels: { fetch } },
    } as unknown as GuildMember;

    await service.handleMemberJoin(member);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an invalid email without exposing it publicly', async () => {
    const service = createService();
    const reply = vi.fn();
    const interaction = {
      customId: 'email-verification:email',
      isButton: () => false,
      isModalSubmit: () => true,
      inCachedGuild: () => true,
      fields: {
        getTextInputValue: () => 'not-an-email',
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
      content: 'Please enter a valid email address.',
      flags: MessageFlags.Ephemeral,
    });
  });
});
