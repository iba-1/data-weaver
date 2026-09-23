import type { FieldConfig, RowEdit, RowValidation } from './types';
import { parseNumber } from './values';

/**
 * Turn a value typed or proposed during review into the field's type:
 * numbers lose currency symbols and separators, empty strings become null.
 * Every review change (cell edits, find/replace, AI Edit) goes through here.
 */
export function coerceEditedValue(value: unknown, field?: Pick<FieldConfig, 'type'>): unknown {
  if (field?.type === 'number' && typeof value === 'string') {
    return parseNumber(value);
  }
  if (value === '') return null;
  return value;
}

/**
 * Apply edits to the rows they target. Changes to keys that are not
 * configured fields, and edits for rows that don't exist, are ignored.
 * Returns the rows that changed, keyed by rowIndex, with unvalidated data.
 */
export function applyRowEdits<TRecord>(
  rows: RowValidation<TRecord>[],
  edits: RowEdit[],
  fields: FieldConfig[]
): Map<number, RowValidation<TRecord>> {
  const byIndex = new Map(rows.map((row) => [row.rowIndex, row]));
  const changed = new Map<number, RowValidation<TRecord>>();

  for (const edit of edits) {
    const row = changed.get(edit.rowIndex) ?? byIndex.get(edit.rowIndex);
    if (!row) continue;

    const data = { ...(row.data as Record<string, unknown>) };
    let modified = false;
    for (const [key, value] of Object.entries(edit.changes)) {
      const field = fields.find((f) => f.key === key);
      if (!field) continue;
      data[key] = coerceEditedValue(value, field);
      modified = true;
    }
    if (modified) changed.set(edit.rowIndex, { ...row, data: data as TRecord });
  }

  return changed;
}
