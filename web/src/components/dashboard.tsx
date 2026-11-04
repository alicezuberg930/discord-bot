import {
  ClockIcon,
  DownloadIcon,
  LogOutIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  UserMinusIcon,
  UserPlusIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ActivityCard } from '@/components/activity-card';
import { LiveIndicator } from '@/components/live-indicator';
import { MembersCard } from '@/components/members-card';
import { StatCards } from '@/components/stat-cards';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { api, ApiError, DOWNLOAD_URL } from '@/lib/api';
import { diffOverview, type MemberChange } from '@/lib/diff';
import { formatClock, formatLongDate, formatRelative } from '@/lib/format';
import { useLiveUpdates } from '@/lib/live';
import { applyNow, useNow } from '@/lib/now';
import type { MemberFilter, MemberOverview } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Several Discord events often arrive together (e.g. role add + update). */
const RELOAD_DEBOUNCE_MS = 400;
const HIGHLIGHT_MS = 12_000;
const MAX_TOASTS = 4;

function announce(changes: MemberChange[]) {
  for (const change of changes.slice(0, MAX_TOASTS)) {
    switch (change.kind) {
      case 'joined':
        toast(`${change.name} vừa vào server`, {
          description: 'Thành viên mới, chưa xác thực',
          icon: <UserPlusIcon className="size-4 text-sky-600" />,
        });
        break;
      case 'verified':
        toast.success(`${change.name} đã xác thực`, {
          description: 'Đã có vai trò xác thực',
        });
        break;
      case 'lost-role':
        toast.warning(`${change.name} không còn vai trò xác thực`);
        break;
      case 'left':
        toast(`${change.name} đã rời server`, {
          icon: <UserMinusIcon className="size-4 text-muted-foreground" />,
        });
        break;
    }
  }

  if (changes.length > MAX_TOASTS) {
    toast(`Và ${changes.length - MAX_TOASTS} thay đổi khác`);
  }
}

export function Dashboard({
  username,
  onSessionEnded,
}: {
  username: string;
  onSessionEnded: (notice: string | null) => void;
}) {
  const [data, setData] = useState<MemberOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MemberFilter>('all');
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const overviewRef = useRef<MemberOverview | null>(null);
  const reloadTimer = useRef<number | undefined>(undefined);
  const highlightTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const next = await api.overview();
      const previous = overviewRef.current;

      if (previous) {
        const changes = diffOverview(previous, next);

        if (changes.length > 0) {
          announce(changes);
          setHighlighted(
            new Set(
              changes
                .filter((change) => change.kind !== 'left')
                .map((change) => change.discordUserId),
            ),
          );
          window.clearTimeout(highlightTimer.current);
          highlightTimer.current = window.setTimeout(
            () => setHighlighted(new Set()),
            HIGHLIGHT_MS,
          );
        }
      }

      overviewRef.current = next;
      setData(next);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionEnded(err.message);
        return;
      }

      setError(
        err instanceof ApiError
          ? err.message
          : 'Không tải được dữ liệu, vui lòng thử lại.',
      );
    } finally {
      setLoading(false);
    }
  }, [onSessionEnded]);

  const reloadSoon = useCallback(() => {
    window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(
      () => void load(),
      RELOAD_DEBOUNCE_MS,
    );
  }, [load]);

  const liveMode = useLiveUpdates({
    onChange: reloadSoon,
    onUnauthorized: onSessionEnded,
  });

  useEffect(() => {
    void load();
    return () => {
      window.clearTimeout(reloadTimer.current);
      window.clearTimeout(highlightTimer.current);
    };
  }, [load]);

  // Everything time-based (clock, "x giây trước", Mới/Cũ, Bạn mới) follows
  // this ticking clock; member data itself arrives over the live stream.
  const now = useNow();
  const overview = useMemo(
    () => (data ? applyNow(data, now) : null),
    [data, now],
  );

  async function logout() {
    await api.logout().catch(() => undefined);
    onSessionEnded(null);
  }

  return (
    <div className="min-h-svh bg-muted/40">
      <Toaster position="bottom-right" closeButton />
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheckIcon className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold tracking-tight">
              Quản lý thành viên
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {overview?.guildName ?? 'Discord'}
            </div>
          </div>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {username}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void logout()}
            aria-label="Đăng xuất"
          >
            <LogOutIcon />
            <span className="hidden sm:inline">Đăng xuất</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              Tổng quan thành viên
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              <LiveIndicator mode={liveMode} />
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon className="size-4" />
                <time
                  dateTime={now.toISOString()}
                  className="font-medium text-foreground tabular-nums"
                >
                  {formatClock(now)}
                </time>
                <span>· {formatLongDate(now)}</span>
              </span>
              {!overview ? (
                <span>Đang tải dữ liệu…</span>
              ) : (
                // While live, data is pushed the moment it changes; otherwise
                // show how old the last load is.
                liveMode !== 'live' && (
                  <span className="tabular-nums">
                    Dữ liệu tải {formatRelative(overview.generatedAt, now)}
                  </span>
                )
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCwIcon className={cn(loading && 'animate-spin')} />
              Làm mới
            </Button>
            <a className={buttonVariants()} href={DOWNLOAD_URL}>
              <DownloadIcon />
              Tải Excel
            </a>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Không tải được dữ liệu</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {overview && !overview.discordConnected && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>Bot chưa kết nối Discord</AlertTitle>
            <AlertDescription>
              Chưa lấy được danh sách thành viên. Trang sẽ tự cập nhật khi bot
              kết nối lại.
            </AlertDescription>
          </Alert>
        )}

        {overview ? (
          <>
            <StatCards
              counts={overview.counts}
              newMemberHours={overview.newMemberHours}
              filter={filter}
              onFilterChange={setFilter}
            />
            <MembersCard
              overview={overview}
              now={now}
              filter={filter}
              onFilterChange={setFilter}
              highlighted={highlighted}
            />
            <ActivityCard overview={overview} now={now} />
            {overview.counts.registeredNotInServer > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                Có {overview.counts.registeredNotInServer} người đã xác thực
                nhưng hiện không còn trong server (vẫn có trong file Excel).
              </p>
            )}
          </>
        ) : (
          !error && <DashboardSkeleton />
        )}
      </main>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[124px] rounded-xl bg-background" />
        ))}
      </div>
      <Skeleton className="h-[480px] rounded-xl bg-background" />
    </>
  );
}
