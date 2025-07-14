export class PaginationDto<T> {
  public static readonly DEFAULT_PAGE = 1;
  public static readonly DEFAULT_PAGE_SIZE = 10;

  public items: T[];
  public currentPage: number;
  public perPage: number;
  public totalItems: number;
  public totalPages: number;
  public hasNextPage: boolean;
  public hasPreviousPage: boolean;

  public constructor(items: T[], totalItems: number, currentPage: number, perPage: number) {
    this.items = items;
    this.currentPage = currentPage;
    this.perPage = perPage;
    this.totalItems = totalItems;
    this.totalPages = Math.ceil(totalItems / perPage);
    this.hasNextPage = currentPage < this.totalPages;
    this.hasPreviousPage = currentPage > 1;
  }
}