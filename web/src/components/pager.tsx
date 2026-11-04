import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { getPageItems } from '@/lib/pagination';

export const PAGE_SIZES = [10, 20, 50, 100];

/** "Hiển thị 1–10 trên 125" + rows-per-page + shadcn pagination. */
export function Pager({
  page,
  pageCount,
  from,
  to,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  unit,
}: {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  unit: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 border-t px-6 pt-4 sm:flex-row sm:justify-between">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {total === 0 ? (
            `Không có ${unit}`
          ) : (
            <>
              Hiển thị{' '}
              <span className="font-medium text-foreground">
                {from}–{to}
              </span>{' '}
              trên <span className="font-medium text-foreground">{total}</span>{' '}
              {unit}
            </>
          )}
        </span>
        {onPageSizeChange && (
          <label className="hidden items-center gap-2 md:flex">
            <span>Số dòng</span>
            <select
              className="h-8 cursor-pointer rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {pageCount > 1 && (
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              />
            </PaginationItem>
            {getPageItems(page, pageCount).map((item) => (
              <PaginationItem key={item}>
                {typeof item === 'number' ? (
                  <PaginationLink
                    isActive={item === page}
                    onClick={() => onPageChange(item)}
                  >
                    {item}
                  </PaginationLink>
                ) : (
                  <PaginationEllipsis />
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                disabled={page >= pageCount}
                onClick={() => onPageChange(page + 1)}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
