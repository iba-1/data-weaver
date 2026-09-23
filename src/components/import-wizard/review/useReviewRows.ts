import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { FieldConfig, RowEdit, RowValidation, ValidationResult } from '@/lib/import-wizard/types';
import { resolveRequiredKeys, revalidateRow } from '@/lib/import-wizard/validator';
import { applyRowEdits } from '@/lib/import-wizard/edits';
import { useHistory } from '@/hooks/useHistory';

export interface ReviewRowsOptions<TRecord, TKey extends string> {
  fields: FieldConfig<TKey>[];
  /** Extra required field keys, on top of fields marked `required: true` */
  requiredFields?: TKey[];
  /** Host App row validator, re-applied after every edit */
  validateRow?: (data: TRecord, rowIndex: number) => ValidationResult[];
  onRowsChange?: (rows: RowValidation<TRecord>[]) => void;
}

/**
 * The rows under review and every way the Importer can change them. Each
 * change is one undo step, changed rows are revalidated, and the Host App
 * hears about it through `onRowsChange`.
 */
export function useReviewRows<TRecord, TKey extends string>(
  initialRows: RowValidation<TRecord>[],
  { fields, requiredFields, validateRow, onRowsChange }: ReviewRowsOptions<TRecord, TKey>
) {
  const {
    state: rows,
    set: setRows,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory<RowValidation<TRecord>[]>(initialRows);

  const requiredKeys = useMemo(() => resolveRequiredKeys(fields, requiredFields), [fields, requiredFields]);

  const revalidate = useCallback(
    (row: RowValidation<TRecord>) =>
      revalidateRow<TRecord, TKey>(row, { fields, requiredFields, customValidator: validateRow }),
    [fields, requiredFields, validateRow]
  );

  // Tell the parent about changes (edits, undo/redo), but not the initial rows it gave us
  const onRowsChangeRef = useRef(onRowsChange);
  useEffect(() => {
    onRowsChangeRef.current = onRowsChange;
  });
  const isInitialRowsRef = useRef(true);
  useEffect(() => {
    if (isInitialRowsRef.current) {
      isInitialRowsRef.current = false;
      return;
    }
    onRowsChangeRef.current?.(rows);
  }, [rows]);

  /**
   * Apply edits from cell edits, find/replace or AI Edit. Only configured
   * fields of existing rows change; values are coerced to each field's type.
   */
  const applyEdits = useCallback(
    (edits: RowEdit[]) => {
      setRows((prevRows) => {
        const changed = applyRowEdits(prevRows, edits, fields);
        if (changed.size === 0) return prevRows;
        return prevRows.map((row) => {
          const edited = changed.get(row.rowIndex);
          return edited ? revalidate(edited) : row;
        });
      });
    },
    [fields, revalidate, setRows]
  );

  const editCell = useCallback(
    (rowIndex: number, fieldKey: TKey, value: string) =>
      applyEdits([{ rowIndex, changes: { [fieldKey]: value } }]),
    [applyEdits]
  );

  // Exclusion: the Importer deliberately leaves rows out of the import
  const setExcluded = useCallback(
    (shouldExclude: (row: RowValidation<TRecord>) => boolean, excluded: boolean) => {
      setRows((prevRows) =>
        prevRows.map((row) =>
          shouldExclude(row) && !!row.excluded !== excluded ? { ...row, excluded } : row
        )
      );
    },
    [setRows]
  );

  const toggleExcluded = useCallback(
    (rowIndex: number, excluded: boolean) => setExcluded((row) => row.rowIndex === rowIndex, excluded),
    [setExcluded]
  );

  const excludeInvalid = useCallback(() => setExcluded((row) => !row.isValid, true), [setExcluded]);

  // Fill empty required fields of invalid rows with placeholder values
  const fillEmptyRequired = useCallback(() => {
    setRows((prevRows) =>
      prevRows.map((row) => {
        if (row.isValid || row.excluded) return row;

        const data = { ...(row.data as Record<string, unknown>) };
        let modified = false;

        for (const fieldKey of requiredKeys) {
          const value = data[fieldKey];
          if (value === null || value === undefined || value === '') {
            const field = fields.find((f) => f.key === fieldKey);
            if (field?.type === 'number') {
              data[fieldKey] = field.placeholder ? parseFloat(field.placeholder) || 0 : 0;
            } else {
              data[fieldKey] = field?.placeholder || 'N/A';
            }
            modified = true;
          }
        }

        return modified ? revalidate({ ...row, data: data as TRecord }) : row;
      })
    );
  }, [fields, requiredKeys, revalidate, setRows]);

  return {
    rows,
    requiredKeys,
    undo,
    redo,
    canUndo,
    canRedo,
    applyEdits,
    editCell,
    toggleExcluded,
    excludeInvalid,
    fillEmptyRequired,
  };
}
