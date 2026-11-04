const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** "20:14 04/11/2026" in Vietnam time. */
export function formatDateTime(value: string | null): string {
  return value ? dateTimeFormat.format(new Date(value)) : '—';
}

/** "21:05:42" in Vietnam time. */
export function formatClock(date: Date): string {
  return timeFormat.format(date);
}

/** "Thứ Tư, 04/11/2026" in Vietnam time. */
export function formatLongDate(date: Date): string {
  return dateFormat.format(date);
}

export function formatRelative(value: string, now: Date = new Date()): string {
  const seconds = Math.floor(
    (now.getTime() - new Date(value).getTime()) / 1000,
  );

  if (seconds < 10) return 'vừa xong';
  if (seconds < 60) return `${seconds} giây trước`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;

  return `${Math.floor(months / 12)} năm trước`;
}

/** Lower-case and strip Vietnamese diacritics so "lam chi" finds "LÂM CHÍ". */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}
