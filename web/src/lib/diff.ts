import type { MemberOverview } from './types';

export type ChangeKind = 'joined' | 'left' | 'verified' | 'lost-role';

export interface MemberChange {
  kind: ChangeKind;
  discordUserId: string;
  name: string;
}

/** What changed between two loads of the overview (for toasts/highlights). */
export function diffOverview(
  previous: MemberOverview,
  next: MemberOverview,
): MemberChange[] {
  const before = new Map(previous.members.map((m) => [m.discordUserId, m]));
  const after = new Map(next.members.map((m) => [m.discordUserId, m]));
  const changes: MemberChange[] = [];

  for (const member of next.members) {
    const old = before.get(member.discordUserId);
    const base = {
      discordUserId: member.discordUserId,
      name: member.displayName,
    };

    if (!old) {
      changes.push({ ...base, kind: 'joined' });
    } else if (old.status !== 'verified' && member.status === 'verified') {
      changes.push({ ...base, kind: 'verified' });
    } else if (old.status === 'verified' && member.status !== 'verified') {
      changes.push({ ...base, kind: 'lost-role' });
    }
  }

  for (const member of previous.members) {
    if (!after.has(member.discordUserId)) {
      changes.push({
        kind: 'left',
        discordUserId: member.discordUserId,
        name: member.displayName,
      });
    }
  }

  return changes;
}
