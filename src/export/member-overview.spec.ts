import {
  buildMemberOverview,
  type BuildOverviewInput,
  type MemberInput,
} from './member-overview.js';

const NOW = new Date('2026-11-04T13:30:00Z');
const VERIFIED = 'verified-role';
const RANK = 'rank-role';

function member(overrides: Partial<MemberInput>): MemberInput {
  return {
    discordUserId: 'id',
    username: 'user',
    displayName: 'User',
    avatarUrl: null,
    joinedAt: new Date('2026-10-01T00:00:00Z'),
    roles: [],
    ...overrides,
  };
}

function build(input: Partial<BuildOverviewInput>) {
  return buildMemberOverview({
    now: NOW,
    discordConnected: true,
    guildName: 'Guild',
    members: [],
    registeredUsers: [],
    verifiedRoleIds: [VERIFIED, RANK],
    ...input,
  });
}

describe('buildMemberOverview', () => {
  it('classifies members as verified, needs-role or unverified', () => {
    const overview = build({
      members: [
        member({
          discordUserId: 'a',
          roles: [{ id: VERIFIED, name: 'Đạo hữu', color: 0, position: 1 }],
        }),
        member({
          discordUserId: 'b',
          roles: [{ id: RANK, name: 'Kết Đan', color: 0xff0000, position: 5 }],
        }),
        member({ discordUserId: 'c' }),
        member({ discordUserId: 'd' }),
      ],
      registeredUsers: [
        {
          discordUserId: 'c',
          accountName: 'Game C',
          createdAt: new Date('2026-11-01T00:00:00Z'),
        },
      ],
    });
    const status = Object.fromEntries(
      overview.members.map((m) => [m.discordUserId, m.status]),
    );

    expect(status).toEqual({
      a: 'verified',
      b: 'verified',
      c: 'needs-role',
      d: 'unverified',
    });
    expect(overview.counts).toMatchObject({
      total: 4,
      verified: 2,
      needsRole: 1,
      unverified: 1,
    });
    expect(
      overview.members.find((m) => m.discordUserId === 'c')?.accountName,
    ).toBe('Game C');
  });

  it('marks members who joined in the last 24 hours as new and lists them first', () => {
    const overview = build({
      members: [
        member({
          discordUserId: 'old',
          joinedAt: new Date('2026-11-03T13:29:00Z'),
        }),
        member({
          discordUserId: 'new',
          joinedAt: new Date('2026-11-04T13:14:00Z'),
        }),
      ],
    });

    expect(overview.members.map((m) => [m.discordUserId, m.isNew])).toEqual([
      ['new', true],
      ['old', false],
    ]);
    expect(overview.counts.newMembers).toBe(1);
    expect(overview.newMemberHours).toBe(24);
  });

  it('sorts roles by position and turns colours into hex', () => {
    const overview = build({
      members: [
        member({
          roles: [
            { id: 'low', name: 'Low', color: 0, position: 1 },
            { id: 'high', name: 'High', color: 0x00ff00, position: 9 },
          ],
        }),
      ],
    });

    expect(overview.members[0].roles).toEqual([
      { name: 'High', color: '#00ff00' },
      { name: 'Low', color: null },
    ]);
  });

  it('builds a newest-first log of joins and form submissions with the current status', () => {
    const overview = build({
      members: [
        member({
          discordUserId: 'milk',
          displayName: 'Milk',
          username: 'donttuchme',
          joinedAt: new Date('2026-11-04T13:14:00Z'),
        }),
      ],
      registeredUsers: [
        {
          discordUserId: 'gone',
          accountName: 'Left Player',
          createdAt: new Date('2026-11-03T10:00:00Z'),
        },
      ],
    });

    expect(overview.log).toEqual([
      {
        at: new Date('2026-11-04T13:14:00Z'),
        kind: 'joined',
        name: 'Milk',
        detail: '@donttuchme',
        status: 'unverified',
      },
      {
        at: new Date('2026-11-03T10:00:00Z'),
        kind: 'verified',
        name: 'Left Player',
        detail: 'Tên tài khoản: Left Player',
        status: 'left',
      },
    ]);
    expect(overview.counts.registeredNotInServer).toBe(1);
  });
});
