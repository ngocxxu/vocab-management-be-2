interface QueryBuilderOptions<TQuery, TWhere> {
  stringFields?: (keyof TQuery)[];
  enumFields?: (keyof TQuery)[];
  customMap?: (query: TQuery, where: Partial<TWhere>) => void;
}

export function buildPrismaWhere<TQuery extends object, TWhere extends object>(
  query: TQuery,
  options: QueryBuilderOptions<TQuery, TWhere>
): TWhere {
  const where: Partial<TWhere> = {};

  // Handle string fields (e.g., name, search)
  if (options.stringFields) {
    for (const field of options.stringFields) {
      const value = query[field];
      if (typeof value === 'string' && value.length > 0) {
        (where as Record<string, unknown>)[field as string] = { contains: value, mode: 'insensitive' };
      }
    }
  }

  // Handle enum fields (e.g., status, type)
  if (options.enumFields) {
    for (const field of options.enumFields) {
      const value = query[field];
      if (value !== undefined) {
        (where as Record<string, unknown>)[field as string] = value;
      }
    }
  }

  // Allow custom mapping for advanced/nested fields
  if (options.customMap) {
    options.customMap(query, where);
  }

  return where as TWhere;
}