import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FieldConfig, RowValidation } from '@/lib/import-wizard/types';
import { countSearchMatches, rowMatchesSearch } from '@/lib/import-wizard/search';

/** Which rows the summary badges narrow the grid to */
export type RowFilter = 'all' | 'errors' | 'warnings';

const ROWS_PER_PAGE = 10;

function passesFilter<TRecord>(row: RowValidation<TRecord>, filter: RowFilter): boolean {
  if (filter === 'errors') return !row.isValid && !row.excluded;
  if (filter === 'warnings') return row.isValid && !row.excluded && row.warnings.length > 0;
  return true;
}

/** The rows the grid shows: filtered, searched and paged */
export function useVisibleRows<TRecord, TKey extends string>(
  rows: RowValidation<TRecord>[],
  fields: FieldConfig<TKey>[]
) {
  const [filter, setFilter] = useState<RowFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  const searchMatchCount = useMemo(
    () => countSearchMatches(rows, fields, searchQuery),
    [rows, fields, searchQuery]
  );

  const filteredRows = useMemo(
    () => rows.filter((row) => passesFilter(row, filter) && rowMatchesSearch(row, fields, searchQuery)),
    [rows, fields, filter, searchQuery]
  );

  const totalPages = Math.ceil(filteredRows.length / ROWS_PER_PAGE);
  const pageRows = filteredRows.slice(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE);

  // Back to the first page when the filter or search changes
  useEffect(() => {
    setCurrentPage(0);
  }, [filter, searchQuery]);

  const previousPage = useCallback(() => setCurrentPage((p) => Math.max(0, p - 1)), []);
  const nextPage = useCallback(
    () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1)),
    [totalPages]
  );

  return {
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    searchMatchCount,
    pageRows,
    pagination: {
      currentPage,
      totalPages,
      pageSize: ROWS_PER_PAGE,
      totalRows: filteredRows.length,
      previousPage,
      nextPage,
    },
  };
}
