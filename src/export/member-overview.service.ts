import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { DiscordService } from '../discord/discord.service.js';
import { UserVerificationService } from '../verification/user-verification.service.js';
import {
  buildMemberOverview,
  type MemberInput,
  type MemberOverview,
} from './member-overview.js';

/** Collects Discord members and verification records for the admin page. */
@Injectable()
export class MemberOverviewService {
  private readonly logger = new Logger(MemberOverviewService.name);

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly prisma: PrismaService,
    private readonly discordService: DiscordService,
    private readonly userVerificationService: UserVerificationService,
  ) {}

  async getOverview(): Promise<MemberOverview> {
    const guildId = this.configService.get('DISCORD_GUILD_ID', { infer: true });
    const registeredUsers = await this.prisma.user.findMany({
      where: guildId ? { guildId } : undefined,
      select: { discordUserId: true, accountName: true, createdAt: true },
    });

    const guild = guildId ? await this.discordService.getGuild(guildId) : null;
    let members: MemberInput[] = [];
    let verifiedRoleIds: string[] = [];

    if (guild) {
      try {
        verifiedRoleIds =
          await this.userVerificationService.getVerifiedRoleIds(guild);
      } catch (error) {
        this.logger.warn(
          `Could not resolve the verified role for the member overview: ${String(error)}`,
        );
      }

      members = [...guild.members.cache.values()]
        .filter((member) => !member.user.bot)
        .map((member) => ({
          discordUserId: member.id,
          username: member.user.username,
          displayName: member.displayName,
          avatarUrl: member.displayAvatarURL({ size: 64 }),
          joinedAt: member.joinedAt,
          roles: [...member.roles.cache.values()]
            .filter((role) => role.id !== guild.id)
            .map((role) => ({
              id: role.id,
              name: role.name,
              color: role.colors.primaryColor,
              position: role.position,
            })),
        }));
    }

    return buildMemberOverview({
      now: new Date(),
      discordConnected: guild !== null,
      guildName: guild?.name ?? null,
      members,
      registeredUsers,
      verifiedRoleIds,
    });
  }
}
