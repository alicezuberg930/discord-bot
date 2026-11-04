/** Members who joined within this many hours are shown as "new". */
export const NEW_MEMBER_HOURS = 24;
/** How many entries the activity log keeps (newest first). */
export const LOG_LIMIT = 100;

/**
 * - `verified`: holds the verified role (or a promoted rank role).
 * - `needs-role`: submitted the form but currently has no verified role; the
 *   member only has to press the button again to get it back.
 * - `unverified`: never submitted the form.
 */
export type MemberStatus = 'verified' | 'needs-role' | 'unverified';

export interface MemberInput {
  discordUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: Date | null;
  roles: { id: string; name: string; color: number; position: number }[];
}

export interface RegisteredUserInput {
  discordUserId: string;
  accountName: string;
  createdAt: Date;
}

export interface OverviewRole {
  name: string;
  /** CSS hex colour, or null for Discord's default (uncoloured) role. */
  color: string | null;
}

export interface OverviewMember {
  discordUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: Date | null;
  isNew: boolean;
  status: MemberStatus;
  roles: OverviewRole[];
  accountName: string | null;
  verifiedAt: Date | null;
}

export interface OverviewLogEntry {
  at: Date;
  kind: 'joined' | 'verified';
  name: string;
  detail: string | null;
  /** Current state of that member; `left` when they are no longer in the server. */
  status: MemberStatus | 'left';
}

export interface MemberOverview {
  generatedAt: Date;
  /** Window for `isNew`; the page re-evaluates it as time passes. */
  newMemberHours: number;
  discordConnected: boolean;
  guildName: string | null;
  members: OverviewMember[];
  counts: {
    total: number;
    verified: number;
    needsRole: number;
    unverified: number;
    newMembers: number;
    registeredNotInServer: number;
  };
  log: OverviewLogEntry[];
}

export interface BuildOverviewInput {
  now: Date;
  discordConnected: boolean;
  guildName: string | null;
  members: MemberInput[];
  registeredUsers: RegisteredUserInput[];
  verifiedRoleIds: string[];
}

function roleColor(color: number): string | null {
  return color === 0 ? null : `#${color.toString(16).padStart(6, '0')}`;
}

export function buildMemberOverview(input: BuildOverviewInput): MemberOverview {
  const newSince = input.now.getTime() - NEW_MEMBER_HOURS * 60 * 60 * 1000;
  const verifiedRoleIds = new Set(input.verifiedRoleIds);
  const registered = new Map(
    input.registeredUsers.map((user) => [user.discordUserId, user]),
  );

  const members: OverviewMember[] = input.members.map((member) => {
    const record = registered.get(member.discordUserId) ?? null;
    const hasVerifiedRole = member.roles.some((role) =>
      verifiedRoleIds.has(role.id),
    );
    const status: MemberStatus = hasVerifiedRole
      ? 'verified'
      : record
        ? 'needs-role'
        : 'unverified';

    return {
      discordUserId: member.discordUserId,
      username: member.username,
      displayName: member.displayName,
      avatarUrl: member.avatarUrl,
      joinedAt: member.joinedAt,
      isNew: member.joinedAt !== null && member.joinedAt.getTime() >= newSince,
      status,
      roles: [...member.roles]
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ name: role.name, color: roleColor(role.color) })),
      accountName: record?.accountName ?? null,
      verifiedAt: record?.createdAt ?? null,
    };
  });

  // Newest members first, so new arrivals are at the top of the list.
  members.sort(
    (a, b) => (b.joinedAt?.getTime() ?? 0) - (a.joinedAt?.getTime() ?? 0),
  );

  const membersById = new Map(members.map((m) => [m.discordUserId, m]));
  const log: OverviewLogEntry[] = [
    ...members
      .filter((member) => member.joinedAt !== null)
      .map((member): OverviewLogEntry => ({
        at: member.joinedAt as Date,
        kind: 'joined',
        name: member.displayName,
        detail: `@${member.username}`,
        status: member.status,
      })),
    ...input.registeredUsers.map((user): OverviewLogEntry => {
      const member = membersById.get(user.discordUserId);

      return {
        at: user.createdAt,
        kind: 'verified',
        name: member?.displayName ?? user.accountName,
        detail: `Tên tài khoản: ${user.accountName}`,
        status: member?.status ?? 'left',
      };
    }),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, LOG_LIMIT);

  return {
    generatedAt: input.now,
    newMemberHours: NEW_MEMBER_HOURS,
    discordConnected: input.discordConnected,
    guildName: input.guildName,
    members,
    counts: {
      total: members.length,
      verified: members.filter((m) => m.status === 'verified').length,
      needsRole: members.filter((m) => m.status === 'needs-role').length,
      unverified: members.filter((m) => m.status === 'unverified').length,
      newMembers: members.filter((m) => m.isNew).length,
      registeredNotInServer: input.registeredUsers.filter(
        (user) => !membersById.has(user.discordUserId),
      ).length,
    },
    log,
  };
}
