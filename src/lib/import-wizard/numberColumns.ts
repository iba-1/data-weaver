import type { FieldConfig, RowValidation } from './types';
import { columnDecimal, readNumber, type DecimalSeparator } from './values';
import { validationIssue } from './messages';

/**
 * A number cell's value from its text: the number, or the text itself when it
 * is not a number (so the cell can be flagged and fixed, like dates), or null.
 */
export function numberCellValue(text: string, decimal: DecimalSeparator | null): unknown {
  const reading = readNumber(text, decimal);
  return reading.unreadable ? text.trim() : reading.value;
}

/**
 * Read every number column again from its cells' texts, with the decimal
 * separator the column shows (`columnDecimal`), and flag the cells still
 * ambiguous (`1.500` in a column that shows nothing) with a warning.
 *
 * Run after the file is read and after every change in review (edits,
 * exclusions, undo aside, which restores settled rows): a change can settle
 * the other cells of its column. Excluded Rows don't count as evidence. Rows
 * whose value changes go through `revalidate`; the rest are returned as they
 * are unless their ambiguity warnings change.
 */
export function settleNumberColumns<TRecord>(
  rows: RowValidation<TRecord>[],
  fields: FieldConfig[] | undefined,
  revalidate: (row: RowValidation<TRecord>) => RowValidation<TRecord>
): RowValidation<TRecord>[] {
  const numberFields = (fields ?? []).filter((field) => field.type === 'number');
  if (numberFields.length === 0) return rows;

  const decimals = new Map(
    numberFields.map((field) => [
      field.key,
      columnDecimal(
        rows
          .filter((row) => !row.excluded)
          .map((row) => row.numberTexts?.[field.key])
          .filter((text): text is string => Boolean(text))
      ),
    ])
  );

  return rows.map((row) => {
    const texts = row.numberTexts;
    const hadAmbiguity = row.warnings.some((w) => w.messageRef?.key === 'ambiguousNumber');
    if (!texts && !hadAmbiguity) return row;

    let data = row.data as Record<string, unknown>;
    let changed = false;
    const ambiguous: ReturnType<typeof validationIssue>[] = [];

    for (const field of numberFields) {
      const text = texts?.[field.key];
      if (text === undefined) continue;
      const decimal = decimals.get(field.key) ?? null;
      const reading = readNumber(text, decimal);
      const read = numberCellValue(text, decimal);
      const value = field.transform && !reading.unreadable ? field.transform(read) : read;
      if (data[field.key] !== value) {
        data = { ...data, [field.key]: value };
        changed = true;
      }
      if (reading.ambiguous && reading.value !== null) {
        ambiguous.push(
          validationIssue(field.key, {
            key: 'ambiguousNumber',
            params: { field: field.label, text: text.trim(), value: reading.value },
          })
        );
      }
    }

    const next = changed ? revalidate({ ...row, data: data as TRecord }) : row;
    const others = next.warnings.filter((w) => w.messageRef?.key !== 'ambiguousNumber');
    if (ambiguous.length === 0 && others.length === next.warnings.length) return next;
    return { ...next, warnings: [...others, ...ambiguous] };
  });
}
