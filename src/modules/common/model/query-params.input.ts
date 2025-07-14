export class QueryParamsInput {
    public page?: number = 1;
    public pageSize?: number = 10;
    public sortBy?: string;
    public sortOrder?: 'asc' | 'desc' = 'desc';
    public filter?: string;
    public search?: string;
  }