import { HistoryIcon, ShieldCheckIcon, UserPlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Pager } from '@/components/pager';
import { StatusBadge } from '@/components/status-badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDateTime, formatRelative } from '@/lib/format';
import { paginate } from '@/lib/pagination';
import type { MemberOverview } from '@/lib/types';
import { cn } from '@/lib/utils';

const LOG_PAGE_SIZE = 8;

export function ActivityCard({
  overview,
  now,
}: {
  overview: MemberOverview;
  now: Date;
}) {
  const [page, setPage] = useState(1);
  const view = paginate(overview.log, page, LOG_PAGE_SIZE);

  return (
    <Card className="gap-2 pb-4">
      <CardHeader>
        <CardTitle className="text-base">Nhật ký hoạt động</CardTitle>
        <CardDescription>
          Vào server và gửi form xác thực, kèm trạng thái hiện tại
        </CardDescription>
      </CardHeader>

      {view.pageItems.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-muted-foreground">
          <HistoryIcon className="size-8 opacity-40" />
          <span>Chưa có hoạt động nào.</span>
        </div>
      ) : (
        <ol className="px-6">
          {view.pageItems.map((entry, index) => {
            const joined = entry.kind === 'joined';
            const Icon = joined ? UserPlusIcon : ShieldCheckIcon;

            return (
              <li
                key={`${entry.kind}-${entry.at}-${index}`}
                className="flex items-center gap-3 border-b py-3 last:border-0"
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full',
                    joined
                      ? 'bg-sky-50 text-sky-600'
                      : 'bg-emerald-50 text-emerald-600',
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-medium">{entry.name}</span>{' '}
                    <span className="text-muted-foreground">
                      {joined ? 'đã vào server' : 'đã gửi form xác thực'}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(entry.at)} · {formatRelative(entry.at, now)}
                    {entry.detail && <> · {entry.detail}</>}
                  </p>
                </div>
                <StatusBadge status={entry.status} />
              </li>
            );
          })}
        </ol>
      )}

      <Pager
        unit="hoạt động"
        page={view.page}
        pageCount={view.pageCount}
        from={view.from}
        to={view.to}
        total={overview.log.length}
        pageSize={LOG_PAGE_SIZE}
        onPageChange={setPage}
      />
    </Card>
  );
}
