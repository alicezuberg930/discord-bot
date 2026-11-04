import type { LiveMode } from '@/lib/live';
import { POLL_INTERVAL_MS } from '@/lib/live';
import { cn } from '@/lib/utils';

const MODES: Record<LiveMode, { label: string; dot: string; title: string }> = {
  live: {
    label: 'Trực tiếp',
    dot: 'bg-emerald-500',
    title: 'Thay đổi trên Discord hiện ra ngay lập tức',
  },
  connecting: {
    label: 'Đang kết nối…',
    dot: 'bg-amber-500',
    title: 'Đang kết nối cập nhật trực tiếp',
  },
  polling: {
    label: `Tự làm mới mỗi ${POLL_INTERVAL_MS / 1000} giây`,
    dot: 'bg-zinc-400',
    title:
      'Không mở được kết nối trực tiếp (máy chủ proxy đang giữ dữ liệu), trang tự làm mới định kỳ',
  },
};

export function LiveIndicator({ mode }: { mode: LiveMode }) {
  const { label, dot, title } = MODES[mode];

  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground shadow-xs"
    >
      <span className="relative flex size-2">
        {mode === 'live' && (
          <span
            className={cn(
              'absolute inline-flex size-full animate-ping rounded-full opacity-60',
              dot,
            )}
          />
        )}
        <span className={cn('relative inline-flex size-2 rounded-full', dot)} />
      </span>
      {label}
    </span>
  );
}
