import { useMemo, useState } from 'react';
import type { FieldConfig, RowValidation } from '@/lib/import-wizard/types';
import { countSearchMatches, rowMatchesSearch } from '@/lib/import-wizard/search';

/** Which rows the summary badges narrow the grid to */
export type RowFilter = 'all' | 'errors' | 'warnings' | 'excluded';

function passesFilter<TRecord>(row: RowValidation<TRecord>, filter: RowFilter): boolean {
  if (filter === 'errors') return !row.isValid && !row.excluded;
  if (filter === 'warnings') return row.isValid && !row.excluded && row.warnings.length > 0;
  if (filter === 'excluded') return !!row.excluded;
  return true;
}

/**
 * The rows the grid shows: filtered and searched across every row. Each
 * derived value is one pass over the rows, recomputed only when the rows,
 * filter or search change (never while scrolling).
 */
export function useVisibleRows<TRecord, TKey extends string>(
  rows: RowValidation<TRecord>[],
  fields: FieldConfig<TKey>[]
) {
  const [filter, setFilter] = useState<RowFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const searchMatchCount = useMemo(
    () => countSearchMatches(rows, fields, searchQuery),
    [rows, fields, searchQuery]
  );

  const visibleRows = useMemo(
    () =>
      filter === 'all' && !searchQuery
        ? rows
        : rows.filter((row) => passesFilter(row, filter) && rowMatchesSearch(row, fields, searchQuery)),
    [rows, fields, filter, searchQuery]
  );

  return {
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    searchMatchCount,
    visibleRows,
    totalRows: rows.length,
  };
}
