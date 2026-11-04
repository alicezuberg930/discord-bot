export type PageItem = number | 'ellipsis-start' | 'ellipsis-end';

/**
 * Page buttons to show, e.g. 1 … 4 5 6 … 12. Always includes the first and
 * last page and the pages next to the current one.
 */
export function getPageItems(current: number, total: number): PageItem[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const start = Math.max(2, Math.min(current - 1, total - 4));
  const end = Math.min(total - 1, Math.max(current + 1, 5));
  const items: PageItem[] = [1];

  if (start > 2) items.push('ellipsis-start');
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push('ellipsis-end');
  items.push(total);

  return items;
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): {
  pageItems: T[];
  page: number;
  pageCount: number;
  from: number;
  to: number;
} {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const offset = (safePage - 1) * pageSize;
  const pageItems = items.slice(offset, offset + pageSize);

  return {
    pageItems,
    page: safePage,
    pageCount,
    from: items.length === 0 ? 0 : offset + 1,
    to: offset + pageItems.length,
  };
}
