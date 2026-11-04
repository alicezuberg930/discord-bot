import { useEffect, useState } from 'react';
import type { MemberOverview } from './types';

/** Current time, re-rendered on every wall-clock second. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number;
    const tick = () => {
      setNow(new Date());
      // Align to the next full second so the clock never lags or skips.
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };

    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => window.clearTimeout(timer);
  }, []);

  return now;
}

/**
 * Re-evaluates time-dependent fields against `now`, so "Mới" turns into "Cũ"
 * (and the "Bạn mới" count drops) the moment a member passes the window,
 * without waiting for the next data load.
 */
export function applyNow(overview: MemberOverview, now: Date): MemberOverview {
  const newSince = now.getTime() - overview.newMemberHours * 60 * 60 * 1000;
  let newMembers = 0;
  let changed = false;

  const members = overview.members.map((member) => {
    const isNew =
      member.joinedAt !== null && Date.parse(member.joinedAt) >= newSince;

    if (isNew) newMembers += 1;
    if (isNew === member.isNew) return member;

    changed = true;
    return { ...member, isNew };
  });

  if (!changed && newMembers === overview.counts.newMembers) {
    return overview;
  }

  return {
    ...overview,
    members,
    counts: { ...overview.counts, newMembers },
  };
}
