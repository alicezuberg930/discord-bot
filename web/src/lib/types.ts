/** JSON shape of GET /export-excel/api/overview (src/export/member-overview.ts). */
export type MemberStatus = 'verified' | 'needs-role' | 'unverified';

export interface OverviewRole {
  name: string;
  color: string | null;
}

export interface OverviewMember {
  discordUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string | null;
  isNew: boolean;
  status: MemberStatus;
  roles: OverviewRole[];
  /** Verification form answers; null when the member never submitted it. */
  accountName: string | null;
  phone: string | null;
  cccd: string | null;
  verifiedAt: string | null;
}

export interface OverviewLogEntry {
  at: string;
  kind: 'joined' | 'verified';
  name: string;
  detail: string | null;
  status: MemberStatus | 'left';
}

export interface MemberOverview {
  generatedAt: string;
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

export type MemberFilter = 'all' | 'pending' | 'verified' | 'new';
