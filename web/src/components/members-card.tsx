import { SearchIcon, UsersIcon, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { NewBadge, StatusBadge } from '@/components/status-badge';
import { Pager } from '@/components/pager';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime, formatRelative, normalizeSearch } from '@/lib/format';
import { paginate } from '@/lib/pagination';
import { cn } from '@/lib/utils';
import type {
  MemberFilter,
  MemberOverview,
  OverviewMember,
  OverviewRole,
} from '@/lib/types';

const MAX_VISIBLE_ROLES = 3;

function matchesFilter(member: OverviewMember, filter: MemberFilter) {
  switch (filter) {
    case 'verified':
      return member.status === 'verified';
    case 'pending':
      return member.status !== 'verified';
    case 'new':
      return member.isNew;
    default:
      return true;
  }
}

function RoleList({ roles }: { roles: OverviewRole[] }) {
  if (roles.length === 0) {
    return <span className="text-muted-foreground">Chưa có vai trò</span>;
  }

  const visible = roles.slice(0, MAX_VISIBLE_ROLES);
  const hidden = roles.slice(MAX_VISIBLE_ROLES);

  return (
    <div className="flex max-w-80 flex-wrap gap-1">
      {visible.map((role) => (
        <Badge key={role.name} variant="outline" className="font-normal">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: role.color ?? '#a1a1aa' }}
          />
          {role.name}
        </Badge>
      ))}
      {hidden.length > 0 && (
        <Badge
          variant="muted"
          title={hidden.map((role) => role.name).join(', ')}
        >
          +{hidden.length}
        </Badge>
      )}
    </div>
  );
}

function Empty() {
  return <span className="text-muted-foreground">—</span>;
}

/** Phone / CCCD from the form; one click selects the whole number to copy. */
function FormNumber({ value }: { value: string | null }) {
  return value ? (
    <span className="select-all tabular-nums">{value}</span>
  ) : (
    <Empty />
  );
}

export function MembersCard({
  overview,
  now,
  filter,
  onFilterChange,
  highlighted,
}: {
  overview: MemberOverview;
  /** Ticking clock: relative times and "Mới/Cũ" follow the current time. */
  now: Date;
  filter: MemberFilter;
  onFilterChange: (filter: MemberFilter) => void;
  /** Members that just joined or changed status (shown briefly in blue). */
  highlighted: ReadonlySet<string>;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { counts } = overview;

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query);

    return overview.members.filter(
      (member) =>
        matchesFilter(member, filter) &&
        (!needle ||
          normalizeSearch(
            [
              member.displayName,
              member.username,
              member.accountName,
              member.phone,
              member.cccd,
            ].join(' '),
          ).includes(needle)),
    );
  }, [overview.members, filter, query]);

  const view = paginate(filtered, page, pageSize);
  const tabs: { value: MemberFilter; label: string; count: number }[] = [
    { value: 'all', label: 'Tất cả', count: counts.total },
    {
      value: 'pending',
      label: 'Chưa xác thực',
      count: counts.unverified + counts.needsRole,
    },
    { value: 'verified', label: 'Đã xác thực', count: counts.verified },
    { value: 'new', label: 'Bạn mới', count: counts.newMembers },
  ];

  function changeFilter(next: MemberFilter) {
    onFilterChange(next);
    setPage(1);
  }

  return (
    <Card className="gap-4 pb-4">
      <CardHeader>
        <CardTitle className="text-base">Danh sách thành viên</CardTitle>
        <CardDescription>Người vào server gần nhất ở trên cùng</CardDescription>
      </CardHeader>

      <div className="flex flex-col gap-3 px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                active={filter === tab.value}
                onClick={() => changeFilter(tab.value)}
              >
                {tab.label}
                <span className="rounded-full bg-muted-foreground/10 px-1.5 text-xs tabular-nums">
                  {tab.count}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="relative w-full lg:w-80">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Tìm tên, tài khoản, SĐT, CCCD…"
            aria-label="Tìm thành viên"
            className="pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          {query && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Xoá tìm kiếm"
              className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
              onClick={() => {
                setQuery('');
                setPage(1);
              }}
            >
              <XIcon />
            </Button>
          )}
        </div>
      </div>

      <div className="border-t">
        <Table className="min-w-[1180px]">
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6 text-xs text-muted-foreground">
                Thành viên
              </TableHead>
              <TableHead className="text-xs text-muted-foreground">
                Trạng thái
              </TableHead>
              <TableHead className="text-xs text-muted-foreground">
                Mới / Cũ
              </TableHead>
              <TableHead className="text-xs text-muted-foreground">
                Vai trò
              </TableHead>
              <TableHead className="text-xs text-muted-foreground">
                Vào server
              </TableHead>
              <TableHead className="text-xs text-muted-foreground">
                Tên tài khoản (form)
              </TableHead>
              <TableHead className="text-xs text-muted-foreground">
                Số điện thoại (form)
              </TableHead>
              <TableHead className="pr-6 text-xs text-muted-foreground">
                CCCD (form)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.pageItems.map((member) => (
              <TableRow
                key={member.discordUserId}
                className={cn(
                  'transition-colors duration-1000',
                  highlighted.has(member.discordUserId) &&
                    'bg-sky-50 hover:bg-sky-50',
                )}
              >
                <TableCell className="py-3 pl-6">
                  <div className="flex items-center gap-3">
                    <Avatar src={member.avatarUrl} name={member.displayName} />
                    <div className="min-w-0">
                      <div className="max-w-56 truncate font-medium">
                        {member.displayName}
                      </div>
                      <div className="max-w-56 truncate text-xs text-muted-foreground">
                        @{member.username}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={member.status} />
                </TableCell>
                <TableCell>
                  <NewBadge
                    isNew={member.isNew}
                    hours={overview.newMemberHours}
                  />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <RoleList roles={member.roles} />
                </TableCell>
                <TableCell>
                  <div className="tabular-nums">
                    {formatDateTime(member.joinedAt)}
                  </div>
                  {member.joinedAt && (
                    <div className="text-xs text-muted-foreground">
                      {formatRelative(member.joinedAt, now)}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {member.accountName ? (
                    <>
                      <div className="max-w-48 truncate">
                        {member.accountName}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(member.verifiedAt)}
                      </div>
                    </>
                  ) : (
                    <Empty />
                  )}
                </TableCell>
                <TableCell>
                  <FormNumber value={member.phone} />
                </TableCell>
                <TableCell className="pr-6">
                  <FormNumber value={member.cccd} />
                </TableCell>
              </TableRow>
            ))}
            {view.pageItems.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-14 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UsersIcon className="size-8 opacity-40" />
                    <span>Không có thành viên nào khớp.</span>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Pager
        unit="thành viên"
        page={view.page}
        pageCount={view.pageCount}
        from={view.from}
        to={view.to}
        total={filtered.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </Card>
  );
}
