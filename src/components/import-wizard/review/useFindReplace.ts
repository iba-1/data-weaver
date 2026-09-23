import { useCallback } from 'react';
import type { FieldConfig, ReplaceOptions, RowEdit, RowValidation } from '@/lib/import-wizard/types';
import { countEditedCells, countFindMatches, findReplaceEdits } from '@/lib/import-wizard/search';

/** Find/replace over the rows under review, applied as ordinary row edits */
export function useFindReplace<TRecord, TKey extends string>(
  rows: RowValidation<TRecord>[],
  fields: FieldConfig<TKey>[],
  applyEdits: (edits: RowEdit[]) => void
) {
  const countMatches = useCallback(
    (find: string, options: ReplaceOptions) => countFindMatches(rows, fields, find, options),
    [rows, fields]
  );

  /** Replace every match and return how many cells changed */
  const replaceAll = useCallback(
    (find: string, replace: string, options: ReplaceOptions) => {
      const edits = findReplaceEdits(rows, fields, find, replace, options);
      applyEdits(edits);
      return countEditedCells(edits);
    },
    [rows, fields, applyEdits]
  );

  return { countMatches, replaceAll };
}
