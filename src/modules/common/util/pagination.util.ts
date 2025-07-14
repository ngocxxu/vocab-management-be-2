export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  defaultPage?: number;
  defaultPageSize?: number;
}

export function getPagination(options: PaginationOptions = {}) {
  const page = Number(options.page) > 0 ? Number(options.page) : (options.defaultPage ?? 1);
  const pageSize = Number(options.pageSize) > 0 ? Number(options.pageSize) : (options.defaultPageSize ?? 10);
  const skip = (page - 1) * pageSize;
  const take = pageSize;
  return { page, pageSize, skip, take };
}

export function getOrderBy<T extends string = string>(
  sortBy: T | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
  defaultSort: T,
): Record<T, 'asc' | 'desc'> {
  return sortBy
    ? { [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' } as Record<T, 'asc' | 'desc'>
    : { [defaultSort]: 'desc' } as Record<T, 'asc' | 'desc'>;
}