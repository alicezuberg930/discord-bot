import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import validator from 'validator';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type ModalSubmitInteraction,
  type Role,
} from 'discord.js';
import type { EnvironmentVariables } from '../config/environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import {
  EmailVerificationStatus,
  type EmailVerification,
} from '../generated/prisma/client.js';

const START_BUTTON_ID = 'email-verification:start';
const EMAIL_MODAL_ID = 'email-verification:email';
const EMAIL_INPUT_ID = 'email';
const OTP_BUTTON_ID = 'email-verification:otp-start';
const OTP_MODAL_ID = 'email-verification:otp';
const OTP_INPUT_ID = 'otp';

type VerificationInteraction = ButtonInteraction | ModalSubmitInteraction;

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly otpHashSecret: string;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {
    const configuredSecret = this.configService.get('OTP_HASH_SECRET', {
      infer: true,
    });
    const databaseEnabled = this.configService.get('DATABASE_ENABLED', {
      infer: true,
    });

    if (databaseEnabled && !configuredSecret) {
      throw new Error(
        'OTP_HASH_SECRET must be configured when the database is enabled',
      );
    }

    this.otpHashSecret = configuredSecret ?? 'database-disabled-test-secret';
  }

  async handleMemberJoin(member: GuildMember): Promise<void> {
    if (member.user.bot || member.roles.cache.size > 1) {
      return;
    }

    try {
      const verification = await this.prisma.emailVerification.upsert({
        where: {
          guildId_discordUserId: {
            guildId: member.guild.id,
            discordUserId: member.id,
          },
        },
        create: {
          guildId: member.guild.id,
          discordUserId: member.id,
          joinedAt: member.joinedAt ?? new Date(),
        },
        update: {
          joinedAt: member.joinedAt ?? new Date(),
          leftAt: null,
        },
      });

      if (verification.status === EmailVerificationStatus.VERIFIED) {
        await this.restoreVerifiedRole(member, verification);
        return;
      }

      await this.postVerificationPrompt(member, verification.id);
    } catch (error) {
      this.logUnexpectedError('Failed to prepare member verification', error);
    }
  }

  async removeMember(guildId: string, userId: string): Promise<void> {
    try {
      await this.prisma.emailVerification.updateMany({
        where: { guildId, discordUserId: userId },
        data: { leftAt: new Date() },
      });
    } catch (error) {
      this.logUnexpectedError('Failed to record the member departure', error);
    }
  }

  async handleInteraction(
    interaction: VerificationInteraction,
  ): Promise<boolean> {
    if (!this.isVerificationInteraction(interaction)) {
      return false;
    }

    try {
      await this.expirePendingVerifications();

      if (interaction.isButton()) {
        await this.handleButton(interaction);
      } else {
        await this.handleModal(interaction);
      }
    } catch (error) {
      await this.respondWithError(interaction, error);
    }

    return true;
  }

  private async postVerificationPrompt(
    member: GuildMember,
    verificationId: string,
  ): Promise<void> {
    const channelId = this.configService.get('VERIFICATION_CHANNEL_ID', {
      infer: true,
    });

    if (!channelId) {
      this.logger.warn(
        'Email verification is disabled because VERIFICATION_CHANNEL_ID is not configured',
      );
      return;
    }

    const channel = await member.guild.channels.fetch(channelId);

    if (!channel?.isSendable()) {
      this.logger.error(
        `Verification channel ${channelId} is missing or is not sendable`,
      );
      return;
    }

    await channel.send({
      content: `<@${member.id}>, welcome! Click the button below to verify your email privately and receive the member role. Do not post your email in this channel.`,
      components: [this.createStartButtonRow()],
      allowedMentions: { users: [member.id] },
    });
    await this.prisma.emailVerification.update({
      where: { id: verificationId },
      data: { lastPromptedAt: new Date() },
    });
  }

  private async restoreVerifiedRole(
    member: GuildMember,
    verification: EmailVerification,
  ): Promise<void> {
    const role = await this.resolveVerifiedRole(member.guild);
    await this.assertCanAssignRole(member, role);

    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Restored previously verified member role');
    }

    if (verification.verifiedRoleId !== role.id) {
      await this.prisma.emailVerification.update({
        where: { id: verification.id },
        data: { verifiedRoleId: role.id },
      });
    }
  }

  private isVerificationInteraction(
    interaction: VerificationInteraction,
  ): boolean {
    return interaction.isButton()
      ? interaction.customId === START_BUTTON_ID ||
          interaction.customId === OTP_BUTTON_ID
      : interaction.customId === EMAIL_MODAL_ID ||
          interaction.customId === OTP_MODAL_ID;
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    this.assertGuildInteraction(interaction);

    if (interaction.customId === START_BUTTON_ID) {
      await interaction.showModal(this.createEmailModal());
      return;
    }

    const verification = await this.findVerification(
      interaction.guildId,
      interaction.user.id,
    );

    if (
      !verification ||
      verification.status !== EmailVerificationStatus.PENDING ||
      !verification.emailMasked ||
      !verification.otpExpiresAt ||
      verification.otpExpiresAt <= new Date()
    ) {
      throw new BadRequestException(
        'Your verification code has expired. Click "Verify email" to request a new one.',
      );
    }

    await interaction.showModal(this.createOtpModal(verification.emailMasked));
  }

  private async handleModal(
    interaction: ModalSubmitInteraction,
  ): Promise<void> {
    this.assertGuildInteraction(interaction);

    if (interaction.customId === EMAIL_MODAL_ID) {
      await this.handleEmailSubmission(interaction);
      return;
    }

    await this.handleOtpSubmission(interaction);
  }

  private async handleEmailSubmission(
    interaction: ModalSubmitInteraction,
  ): Promise<void> {
    const guild = interaction.guild;
    const guildId = interaction.guildId;

    if (!guild || !guildId) {
      throw new BadRequestException(
        'Email verification can only be used inside the server.',
      );
    }

    const email = interaction.fields
      .getTextInputValue(EMAIL_INPUT_ID)
      .trim()
      .toLowerCase();

    if (
      email.length > 254 ||
      !validator.isEmail(email, {
        allow_display_name: false,
        allow_utf8_local_part: false,
        require_tld: true,
      })
    ) {
      throw new BadRequestException('Please enter a valid email address.');
    }

    const existingVerification = await this.findVerification(
      guildId,
      interaction.user.id,
    );
    const now = new Date();

    if (
      existingVerification?.resendAvailableAt &&
      existingVerification.resendAvailableAt > now
    ) {
      const waitSeconds = Math.ceil(
        (existingVerification.resendAvailableAt.getTime() - now.getTime()) /
          1_000,
      );
      throw new BadRequestException(
        `Please wait ${waitSeconds} seconds before requesting another code.`,
      );
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await guild.members.fetch(interaction.user.id);
    const role = await this.resolveVerifiedRole(guild);

    if (member.roles.cache.has(role.id)) {
      await interaction.editReply('You already have the member role.');
      return;
    }

    if (!this.emailService.isConfigured()) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured. Ask a server administrator to configure SMTP.',
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttlSeconds = this.configService.get('EMAIL_OTP_TTL_SECONDS', {
      infer: true,
    });
    const resendSeconds = this.configService.get('EMAIL_OTP_RESEND_SECONDS', {
      infer: true,
    });

    await this.emailService.sendVerificationCode(email, code, ttlSeconds);
    const issuedAt = new Date();
    const emailMasked = this.maskEmail(email);

    await this.prisma.emailVerification.upsert({
      where: {
        guildId_discordUserId: {
          guildId,
          discordUserId: interaction.user.id,
        },
      },
      create: {
        guildId,
        discordUserId: interaction.user.id,
        email,
        emailMasked,
        status: EmailVerificationStatus.PENDING,
        otpHash: this.hashOtp(guildId, interaction.user.id, code),
        otpExpiresAt: new Date(issuedAt.getTime() + ttlSeconds * 1_000),
        resendAvailableAt: new Date(issuedAt.getTime() + resendSeconds * 1_000),
        attemptsRemaining: this.configService.get('EMAIL_OTP_MAX_ATTEMPTS', {
          infer: true,
        }),
      },
      update: {
        email,
        emailMasked,
        status: EmailVerificationStatus.PENDING,
        otpHash: this.hashOtp(guildId, interaction.user.id, code),
        otpExpiresAt: new Date(issuedAt.getTime() + ttlSeconds * 1_000),
        resendAvailableAt: new Date(issuedAt.getTime() + resendSeconds * 1_000),
        attemptsRemaining: this.configService.get('EMAIL_OTP_MAX_ATTEMPTS', {
          infer: true,
        }),
        verifiedAt: null,
        verifiedRoleId: null,
        leftAt: null,
      },
    });

    await interaction.editReply({
      content: `A six-digit verification code was sent to **${emailMasked}**.`,
      components: [this.createOtpButtonRow()],
    });
  }

  private async handleOtpSubmission(
    interaction: ModalSubmitInteraction,
  ): Promise<void> {
    const guild = interaction.guild;
    const guildId = interaction.guildId;

    if (!guild || !guildId) {
      throw new BadRequestException(
        'Email verification can only be used inside the server.',
      );
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const verification = await this.findVerification(
      guildId,
      interaction.user.id,
    );

    if (
      !verification ||
      verification.status !== EmailVerificationStatus.PENDING ||
      !verification.otpHash ||
      !verification.otpExpiresAt ||
      verification.otpExpiresAt <= new Date()
    ) {
      if (verification?.status === EmailVerificationStatus.PENDING) {
        await this.markExpired(verification.id);
      }

      await interaction.editReply({
        content:
          'Your verification code has expired. Request a new code to continue.',
        components: [this.createStartButtonRow()],
      });
      return;
    }

    const code = interaction.fields.getTextInputValue(OTP_INPUT_ID).trim();
    const submittedHash = this.hashOtp(guildId, interaction.user.id, code);
    const validCode =
      /^\d{6}$/.test(code) &&
      this.safeHashEqual(verification.otpHash, submittedHash);

    if (!validCode) {
      const attemptsRemaining = Math.max(verification.attemptsRemaining - 1, 0);
      const locked = attemptsRemaining === 0;

      await this.prisma.emailVerification.update({
        where: { id: verification.id },
        data: {
          attemptsRemaining,
          status: locked
            ? EmailVerificationStatus.LOCKED
            : EmailVerificationStatus.PENDING,
          otpHash: locked ? null : verification.otpHash,
        },
      });

      if (locked) {
        await interaction.editReply({
          content:
            'Too many incorrect attempts. Request a new verification code.',
          components: [this.createStartButtonRow()],
        });
        return;
      }

      await interaction.editReply({
        content: `That code is incorrect. ${attemptsRemaining} attempt(s) remain.`,
        components: [this.createOtpButtonRow()],
      });
      return;
    }

    const member = await guild.members.fetch(interaction.user.id);
    const role = await this.resolveVerifiedRole(guild);
    await this.assertCanAssignRole(member, role);

    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Email ownership verified by OTP');
    }

    await this.prisma.emailVerification.update({
      where: { id: verification.id },
      data: {
        status: EmailVerificationStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedRoleId: role.id,
        otpHash: null,
        resendAvailableAt: null,
        attemptsRemaining: 0,
      },
    });

    await interaction.editReply(
      `Email verified successfully. You now have the **${role.name}** role.`,
    );
  }

  private async findVerification(
    guildId: string,
    discordUserId: string,
  ): Promise<EmailVerification | null> {
    return this.prisma.emailVerification.findUnique({
      where: {
        guildId_discordUserId: { guildId, discordUserId },
      },
    });
  }

  private async expirePendingVerifications(): Promise<void> {
    await this.prisma.emailVerification.updateMany({
      where: {
        status: EmailVerificationStatus.PENDING,
        otpExpiresAt: { lte: new Date() },
      },
      data: {
        status: EmailVerificationStatus.EXPIRED,
        otpHash: null,
        resendAvailableAt: null,
        attemptsRemaining: 0,
      },
    });
  }

  private async markExpired(id: string): Promise<void> {
    await this.prisma.emailVerification.update({
      where: { id },
      data: {
        status: EmailVerificationStatus.EXPIRED,
        otpHash: null,
        resendAvailableAt: null,
        attemptsRemaining: 0,
      },
    });
  }

  private assertGuildInteraction(
    interaction: VerificationInteraction,
  ): asserts interaction is VerificationInteraction & {
    guildId: string;
    guild: Guild;
  } {
    if (!interaction.inCachedGuild()) {
      throw new BadRequestException(
        'Email verification can only be used inside the server.',
      );
    }
  }

  private async resolveVerifiedRole(guild: Guild): Promise<Role> {
    const configuredRoleId = this.configService.get('VERIFIED_ROLE_ID', {
      infer: true,
    });

    if (configuredRoleId) {
      const role = await guild.roles.fetch(configuredRoleId).catch(() => null);

      if (role) {
        return role;
      }

      throw new ServiceUnavailableException(
        'The configured member role does not exist.',
      );
    }

    const roleName = this.configService.get('VERIFIED_ROLE_NAME', {
      infer: true,
    });
    const roles = await guild.roles.fetch();
    const matches = [...roles.values()].filter(
      (role) => role.name.toLowerCase() === roleName.toLowerCase(),
    );

    if (matches.length !== 1) {
      throw new ServiceUnavailableException(
        matches.length === 0
          ? `No role named "${roleName}" exists. Create it or configure VERIFIED_ROLE_ID.`
          : `Multiple roles named "${roleName}" exist. Configure VERIFIED_ROLE_ID.`,
      );
    }

    return matches[0];
  }

  private async assertCanAssignRole(
    member: GuildMember,
    role: Role,
  ): Promise<void> {
    const botMember =
      member.guild.members.me ?? (await member.guild.members.fetchMe());

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new ServiceUnavailableException(
        'The bot needs the Manage Roles permission to finish verification.',
      );
    }

    if (role.managed || role.position >= botMember.roles.highest.position) {
      throw new ServiceUnavailableException(
        'Move the bot role above the member role in Server Settings -> Roles.',
      );
    }
  }

  private createStartButtonRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(START_BUTTON_ID)
        .setLabel('Verify email')
        .setStyle(ButtonStyle.Primary),
    );
  }

  private createOtpButtonRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(OTP_BUTTON_ID)
        .setLabel('Enter verification code')
        .setStyle(ButtonStyle.Success),
    );
  }

  private createEmailModal(): ModalBuilder {
    const input = new TextInputBuilder()
      .setCustomId(EMAIL_INPUT_ID)
      .setLabel('Email address')
      .setPlaceholder('you@example.com')
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(254)
      .setStyle(TextInputStyle.Short);

    return new ModalBuilder()
      .setCustomId(EMAIL_MODAL_ID)
      .setTitle('Verify your email')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input),
      );
  }

  private createOtpModal(emailMasked: string): ModalBuilder {
    const input = new TextInputBuilder()
      .setCustomId(OTP_INPUT_ID)
      .setLabel(`Code sent to ${emailMasked}`.slice(0, 45))
      .setPlaceholder('123456')
      .setRequired(true)
      .setMinLength(6)
      .setMaxLength(6)
      .setStyle(TextInputStyle.Short);

    return new ModalBuilder()
      .setCustomId(OTP_MODAL_ID)
      .setTitle('Enter verification code')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input),
      );
  }

  private async respondWithError(
    interaction: VerificationInteraction,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof HttpException
        ? error.message
        : 'Email verification could not be completed. Please try again.';

    if (!(error instanceof HttpException)) {
      this.logUnexpectedError('Email verification failed', error);
    }

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: message, components: [] });
      } else {
        await interaction.reply({
          content: message,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (replyError) {
      this.logUnexpectedError(
        'Failed to send the verification error response',
        replyError,
      );
    }
  }

  private hashOtp(guildId: string, userId: string, code: string): string {
    return createHmac('sha256', this.otpHashSecret)
      .update(`${guildId}:${userId}:${code}`)
      .digest('hex');
  }

  private safeHashEqual(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');

    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    const visibleLocal =
      localPart.length <= 2
        ? `${localPart[0]}*`
        : `${localPart[0]}***${localPart.at(-1)}`;

    return `${visibleLocal}@${domain}`;
  }

  private logUnexpectedError(message: string, error: unknown): void {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    this.logger.error(`${message} (${errorName})`);
  }
}
