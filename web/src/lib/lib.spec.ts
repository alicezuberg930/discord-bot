import { diffOverview } from './diff';
import {
  formatClock,
  formatDateTime,
  formatLongDate,
  formatRelative,
  normalizeSearch,
} from './format';
import { applyNow } from './now';
import { getPageItems, paginate } from './pagination';
import type { MemberOverview, OverviewMember } from './types';

describe('getPageItems', () => {
  it('lists every page when there are few', () => {
    expect(getPageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it.each([
    [1, [1, 2, 3, 4, 5, 'ellipsis-end', 12]],
    [6, [1, 'ellipsis-start', 5, 6, 7, 'ellipsis-end', 12]],
    [12, [1, 'ellipsis-start', 8, 9, 10, 11, 12]],
  ])('shows the pages around page %i of 12', (current, expected) => {
    expect(getPageItems(current, 12)).toEqual(expected);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 23 }, (_, i) => i + 1);

  it('returns the requested page and its range', () => {
    expect(paginate(items, 3, 10)).toEqual({
      pageItems: [21, 22, 23],
      page: 3,
      pageCount: 3,
      from: 21,
      to: 23,
    });
  });

  it('clamps a page that no longer exists (e.g. after filtering)', () => {
    expect(paginate(items, 9, 10).page).toBe(3);
    expect(paginate([], 2, 10)).toMatchObject({ page: 1, from: 0, to: 0 });
  });
});

describe('format', () => {
  const now = new Date('2026-11-04T13:30:00Z');

  it('shows dates in Vietnam time', () => {
    expect(formatDateTime('2026-11-04T13:14:00Z')).toBe('20:14 04/11/2026');
    expect(formatClock(new Date('2026-11-04T14:05:42Z'))).toBe('21:05:42');
    expect(formatLongDate(new Date('2026-11-04T14:05:42Z'))).toBe(
      'Thứ Tư, 04/11/2026',
    );
    expect(formatDateTime(null)).toBe('—');
  });

  it.each([
    ['2026-11-04T13:29:55Z', 'vừa xong'],
    ['2026-11-04T13:29:40Z', '20 giây trước'],
    ['2026-11-04T13:14:00Z', '16 phút trước'],
    ['2026-11-04T10:00:00Z', '3 giờ trước'],
    ['2026-11-01T13:00:00Z', '3 ngày trước'],
    ['2026-08-01T13:00:00Z', '3 tháng trước'],
  ])('formats %s as "%s"', (value, expected) => {
    expect(formatRelative(value, now)).toBe(expected);
  });

  it('ignores case and Vietnamese diacritics when searching', () => {
    expect(normalizeSearch('  LÂM Chí Cường  ')).toBe('lam chi cuong');
    expect(normalizeSearch('Đạo hữu')).toBe('dao huu');
  });
});

describe('diffOverview', () => {
  const member = (id: string, status: OverviewMember['status']) =>
    ({
      discordUserId: id,
      displayName: `User ${id}`,
      status,
    }) as OverviewMember;
  const overview = (members: OverviewMember[]) =>
    ({ members }) as MemberOverview;

  it('reports joins, leaves, new verifications and lost roles', () => {
    const changes = diffOverview(
      overview([
        member('stays', 'verified'),
        member('verifies', 'unverified'),
        member('loses', 'verified'),
        member('leaves', 'unverified'),
      ]),
      overview([
        member('new', 'unverified'),
        member('stays', 'verified'),
        member('verifies', 'verified'),
        member('loses', 'needs-role'),
      ]),
    );

    expect(changes.map((c) => [c.kind, c.discordUserId])).toEqual([
      ['joined', 'new'],
      ['verified', 'verifies'],
      ['lost-role', 'loses'],
      ['left', 'leaves'],
    ]);
  });

  it('reports nothing when nothing changed', () => {
    const same = overview([member('a', 'verified')]);
    expect(diffOverview(same, same)).toEqual([]);
  });
});

describe('applyNow', () => {
  const overview = {
    newMemberHours: 24,
    counts: { newMembers: 2 },
    members: [
      { discordUserId: 'a', joinedAt: '2026-11-04T10:00:00Z', isNew: true },
      { discordUserId: 'b', joinedAt: '2026-11-03T14:00:00Z', isNew: true },
      { discordUserId: 'c', joinedAt: null, isNew: false },
    ],
  } as unknown as MemberOverview;

  it('keeps the data as is while nothing crossed the window', () => {
    expect(applyNow(overview, new Date('2026-11-04T13:30:00Z'))).toBe(overview);
  });

  it('turns members older than the window into "Cũ" as time passes', () => {
    const later = applyNow(overview, new Date('2026-11-04T14:00:01Z'));

    expect(later.members.map((m) => m.isNew)).toEqual([true, false, false]);
    expect(later.counts.newMembers).toBe(1);
  });
});
