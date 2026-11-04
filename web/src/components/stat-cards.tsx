import {
  CircleCheckIcon,
  CircleDashedIcon,
  SparklesIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { MemberFilter, MemberOverview } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Stat {
  filter: MemberFilter;
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  tone: string;
}

export function StatCards({
  counts,
  newMemberHours,
  filter,
  onFilterChange,
}: {
  counts: MemberOverview['counts'];
  newMemberHours: number;
  filter: MemberFilter;
  onFilterChange: (filter: MemberFilter) => void;
}) {
  const pending = counts.unverified + counts.needsRole;
  const stats: Stat[] = [
    {
      filter: 'all',
      label: 'Tổng thành viên',
      value: counts.total,
      hint: 'Không tính bot',
      icon: UsersIcon,
      tone: 'bg-zinc-100 text-zinc-700',
    },
    {
      filter: 'verified',
      label: 'Đã xác thực',
      value: counts.verified,
      hint: 'Có vai trò xác thực hoặc cảnh giới',
      icon: CircleCheckIcon,
      tone: 'bg-emerald-50 text-emerald-600',
    },
    {
      filter: 'pending',
      label: 'Chưa xác thực',
      value: pending,
      hint:
        counts.needsRole > 0
          ? `Trong đó ${counts.needsRole} người đã điền form nhưng thiếu vai trò`
          : 'Chưa điền form xác thực',
      icon: CircleDashedIcon,
      tone: 'bg-red-50 text-red-600',
    },
    {
      filter: 'new',
      label: 'Bạn mới',
      value: counts.newMembers,
      hint: `Vào server trong ${newMemberHours} giờ qua`,
      icon: SparklesIcon,
      tone: 'bg-sky-50 text-sky-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        const active = filter === stat.filter;

        return (
          <button
            key={stat.filter}
            type="button"
            aria-pressed={active}
            onClick={() => onFilterChange(stat.filter)}
            className="group cursor-pointer rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Card
              className={cn(
                'h-full gap-3 py-5 transition-all group-hover:shadow-md',
                active && 'border-primary/40 ring-2 ring-primary/10',
              )}
            >
              <CardHeader className="px-5">
                <CardDescription className="font-medium">
                  {stat.label}
                </CardDescription>
                <CardTitle className="text-3xl font-semibold tracking-tight tabular-nums">
                  {stat.value}
                </CardTitle>
                <CardAction>
                  <span
                    className={cn(
                      'flex size-9 items-center justify-center rounded-lg',
                      stat.tone,
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                </CardAction>
              </CardHeader>
              <CardFooter className="px-5 text-xs leading-snug text-muted-foreground">
                {stat.hint}
              </CardFooter>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
