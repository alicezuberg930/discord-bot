import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { normalizeCccd } from '../config/utils/cccd-validator.js';
import { normalizeVietnameseMobileNumber } from '../config/utils/vietnamese-phone-validator.js';
import { PrismaService } from '../database/prisma.service.js';

const START_BUTTON_ID = 'user-verification:start';
const LEGACY_START_BUTTON_ID = 'email-verification:start';
const DETAILS_MODAL_ID = 'user-verification:details';
const ACCOUNT_NAME_INPUT_ID = 'account_name';
const PHONE_INPUT_ID = 'phone';
const CCCD_INPUT_ID = 'cccd';

type VerificationInteraction = ButtonInteraction | ModalSubmitInteraction;

interface VerificationTarget {
  guildId: string;
  userId: string;
}

@Injectable()
export class UserVerificationService {
  private readonly logger = new Logger(UserVerificationService.name);
  private readonly handledMembers = new Set<string>();

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly prisma: PrismaService,
  ) {}

  async handleMemberJoin(member: GuildMember): Promise<void> {
    if (
      member.user.bot ||
      !this.isConfiguredVerificationGuild(member.guild.id)
    ) {
      return;
    }

    try {
      const role = await this.resolveVerifiedRole(member.guild);
      await this.prepareMemberVerification(member, role);
    } catch (error) {
      this.logUnexpectedError(
        `Failed to prepare verification for Discord user ${member.id} in guild ${member.guild.id}`,
        error,
      );
    }
  }

  async handleExistingGuildMembers(guild: Guild): Promise<void> {
    if (!this.isConfiguredVerificationGuild(guild.id)) {
      return;
    }

    try {
      const role = await this.resolveVerifiedRole(guild);
      const members = await guild.members.fetch();

      for (const member of members.values()) {
        if (member.user.bot) {
          continue;
        }

        try {
          await this.prepareMemberVerification(member, role);
        } catch (error) {
          this.logUnexpectedError(
            `Failed to prepare verification for Discord user ${member.id}`,
            error,
          );
        }
      }

      this.logger.log(
        `Checked ${members.size} existing members in Discord guild ${guild.id}`,
      );
    } catch (error) {
      this.logUnexpectedError(
        `Failed to check existing members in Discord guild ${guild.id}`,
        error,
      );
    }
  }

  private async prepareMemberVerification(
    member: GuildMember,
    role: Role,
  ): Promise<void> {
    if (member.roles.cache.has(role.id)) {
      return;
    }

    const memberKey = `${member.guild.id}:${member.id}`;

    if (this.handledMembers.has(memberKey)) {
      return;
    }

    this.handledMembers.add(memberKey);

    try {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          guildId_discordUserId: {
            guildId: member.guild.id,
            discordUserId: member.id,
          },
        },
      });

      if (existingUser) {
        await this.restoreMemberRole(member, role);
        return;
      }

      await this.postVerificationPrompt(member);
    } catch (error) {
      this.handledMembers.delete(memberKey);
      throw error;
    }
  }

  private isConfiguredVerificationGuild(guildId: string): boolean {
    const configuredGuildId = this.configService.get('DISCORD_GUILD_ID', {
      infer: true,
    });

    return !configuredGuildId || guildId === configuredGuildId;
  }

  async handleInteraction(
    interaction: VerificationInteraction,
  ): Promise<boolean> {
    if (!this.isVerificationInteraction(interaction)) {
      return false;
    }

    try {
      if (interaction.isButton()) {
        const target = this.getButtonTarget(interaction);

        if (!target || target.userId !== interaction.user.id) {
          await this.replyUnauthorizedButton(interaction);
          return true;
        }

        await interaction.showModal(this.createDetailsModal(target));
      } else {
        const target = this.getInteractionTarget(
          interaction.customId,
          DETAILS_MODAL_ID,
          interaction.guildId,
        );

        if (!target || target.userId !== interaction.user.id) {
          await this.replyUnauthorizedButton(interaction);
          return true;
        }

        await this.handleDetailsSubmission(interaction, target.guildId);
      }
    } catch (error) {
      await this.respondWithError(interaction, error);
    }

    return true;
  }

  private isVerificationInteraction(
    interaction: VerificationInteraction,
  ): boolean {
    return interaction.isButton()
      ? interaction.customId === START_BUTTON_ID ||
          interaction.customId === LEGACY_START_BUTTON_ID ||
          interaction.customId.startsWith(`${START_BUTTON_ID}:`)
      : interaction.customId === DETAILS_MODAL_ID ||
          interaction.customId.startsWith(`${DETAILS_MODAL_ID}:`);
  }

  private getButtonTarget(
    interaction: ButtonInteraction,
  ): VerificationTarget | null {
    const target = this.getInteractionTarget(
      interaction.customId,
      START_BUTTON_ID,
      interaction.guildId,
    );

    if (target) {
      return target;
    }

    if (
      interaction.guildId &&
      (interaction.customId === START_BUTTON_ID ||
        interaction.customId === LEGACY_START_BUTTON_ID)
    ) {
      const userId = interaction.message.content.match(/<@!?(\d+)>/)?.[1];

      return userId ? { guildId: interaction.guildId, userId } : null;
    }

    return null;
  }

  private getInteractionTarget(
    customId: string,
    baseId: string,
    fallbackGuildId: string | null,
  ): VerificationTarget | null {
    const prefix = `${baseId}:`;

    if (!customId.startsWith(prefix)) {
      return null;
    }

    const ids = customId.slice(prefix.length).split(':');

    if (ids.length === 2 && ids[0] && ids[1]) {
      return { guildId: ids[0], userId: ids[1] };
    }

    if (ids.length === 1 && ids[0] && fallbackGuildId) {
      return { guildId: fallbackGuildId, userId: ids[0] };
    }

    return null;
  }

  private async replyUnauthorizedButton(
    interaction: VerificationInteraction,
  ): Promise<void> {
    await interaction.reply({
      content: 'Bạn không có quyền nhấn nút xác thực này',
      flags: MessageFlags.Ephemeral,
    });
  }

  private async postVerificationPrompt(member: GuildMember): Promise<void> {
    await member.send({
      content: `Chào mừng bạn đến **${member.guild.name}**! Vui lòng bấm nút bên dưới để xác thực thông tin cá nhân. Tin nhắn và biểu mẫu này chỉ hiển thị cho bạn.`,
      components: [this.createStartButtonRow(member.guild.id, member.id)],
    });

    this.logger.log(
      `Sent a private verification prompt to Discord user ${member.id} for guild ${member.guild.id}`,
    );
  }

  private async handleDetailsSubmission(
    interaction: ModalSubmitInteraction,
    guildId: string,
  ): Promise<void> {
    const accountName = interaction.fields
      .getTextInputValue(ACCOUNT_NAME_INPUT_ID)
      .trim()
      .replace(/\s+/g, ' ');

    if (!accountName || accountName.length > 100) {
      throw new BadRequestException(
        'Tên tài khoản phải có từ 1 đến 100 ký tự.',
      );
    }

    const phone = normalizeVietnameseMobileNumber(
      interaction.fields.getTextInputValue(PHONE_INPUT_ID),
    );

    if (!phone) {
      throw new BadRequestException('Số điện thoại không hợp lệ tại Việt Nam.');
    }

    const cccd = normalizeCccd(
      interaction.fields.getTextInputValue(CCCD_INPUT_ID),
    );

    if (!cccd) {
      throw new BadRequestException(
        'Số căn cước công dân không đúng cấu trúc quy định.',
      );
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild =
      interaction.guild?.id === guildId
        ? interaction.guild
        : await interaction.client.guilds.fetch(guildId);

    if (!this.isConfiguredVerificationGuild(guild.id)) {
      throw new BadRequestException(
        'Máy chủ Discord này không được cấu hình để xác thực người dùng.',
      );
    }

    const member = await guild.members.fetch(interaction.user.id);
    const role = await this.resolveVerifiedRole(guild);
    await this.assertCanAssignRole(member, role);

    const previousEmail = await this.prisma.emailVerification.findUnique({
      where: {
        guildId_discordUserId: {
          guildId,
          discordUserId: interaction.user.id,
        },
      },
      select: { email: true },
    });

    await this.prisma.user.upsert({
      where: {
        guildId_discordUserId: {
          guildId,
          discordUserId: interaction.user.id,
        },
      },
      create: {
        accountName,
        phone,
        cccd,
        guildId,
        discordUserId: interaction.user.id,
        email: previousEmail?.email,
      },
      update: {
        accountName,
        phone,
        cccd,
        email: previousEmail?.email ?? undefined,
      },
    });

    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'User information submitted');
    }

    await interaction.editReply(
      `Xác thực thành công. Bạn đã được cấp vai trò **${role.name}**.`,
    );
  }

  private async restoreMemberRole(
    member: GuildMember,
    role: Role,
  ): Promise<void> {
    await this.assertCanAssignRole(member, role);

    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Restored registered member role');
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
        'Vai trò thành viên đã cấu hình không tồn tại.',
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
          ? `Không tìm thấy vai trò "${roleName}". Hãy tạo vai trò hoặc cấu hình VERIFIED_ROLE_ID.`
          : `Có nhiều vai trò tên "${roleName}". Hãy cấu hình VERIFIED_ROLE_ID.`,
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
        'Bot cần quyền Manage Roles để hoàn tất xác thực.',
      );
    }

    if (role.managed || role.position >= botMember.roles.highest.position) {
      throw new ServiceUnavailableException(
        'Hãy đặt vai trò của bot cao hơn vai trò thành viên trong Server Settings -> Roles.',
      );
    }
  }

  private createStartButtonRow(
    guildId: string,
    targetUserId: string,
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${START_BUTTON_ID}:${guildId}:${targetUserId}`)
        .setLabel('Xác thực người dùng')
        .setStyle(ButtonStyle.Primary),
    );
  }

  private createDetailsModal(target: VerificationTarget): ModalBuilder {
    const accountNameInput = new TextInputBuilder()
      .setCustomId(ACCOUNT_NAME_INPUT_ID)
      .setLabel('Tên tài khoản')
      .setPlaceholder('Nguyễn Văn A')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(100)
      .setStyle(TextInputStyle.Short);
    const phoneInput = new TextInputBuilder()
      .setCustomId(PHONE_INPUT_ID)
      .setLabel('Số điện thoại')
      .setPlaceholder('0912345678')
      .setRequired(true)
      .setMinLength(9)
      .setMaxLength(20)
      .setStyle(TextInputStyle.Short);
    const cccdInput = new TextInputBuilder()
      .setCustomId(CCCD_INPUT_ID)
      .setLabel('Căn cước nhân dân')
      .setPlaceholder('012345678901')
      .setRequired(true)
      .setMinLength(12)
      .setMaxLength(14)
      .setStyle(TextInputStyle.Short);

    return new ModalBuilder()
      .setCustomId(`${DETAILS_MODAL_ID}:${target.guildId}:${target.userId}`)
      .setTitle('Xác thực người dùng')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          accountNameInput,
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(phoneInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(cccdInput),
      );
  }

  private async respondWithError(
    interaction: VerificationInteraction,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof HttpException
        ? error.message
        : 'Không thể hoàn tất xác thực. Vui lòng thử lại.';

    if (!(error instanceof HttpException)) {
      this.logUnexpectedError('User verification failed', error);
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

  private logUnexpectedError(message: string, error: unknown): void {
    if (error instanceof Error) {
      this.logger.error(
        `${message} (${error.name}): ${error.message}`,
        error.stack,
      );
      return;
    }

    this.logger.error(`${message} (UnknownError): ${String(error)}`);
  }
}
