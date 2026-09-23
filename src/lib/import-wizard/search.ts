import type { FieldConfig, ReplaceOptions, RowEdit, RowValidation } from './types';
import { cellText } from './values';

type FieldKeys = Pick<FieldConfig, 'key'>[];

function cellValues<TRecord>(row: RowValidation<TRecord>): Record<string, unknown> {
  return row.data as Record<string, unknown>;
}

// ============================================================
// SEARCH
// ============================================================

/** Whether a cell's text (see `cellText`) contains the search text, ignoring case */
export function matchesSearch(value: unknown, query: string): boolean {
  if (!query) return false;
  const text = cellText(value);
  return text !== '' && text.toLowerCase().includes(query.toLowerCase());
}

/** Whether any of the row's fields contains the search text; an empty search matches every row */
export function rowMatchesSearch<TRecord>(
  row: RowValidation<TRecord>,
  fields: FieldKeys,
  query: string
): boolean {
  if (!query) return true;
  const data = cellValues(row);
  return fields.some((field) => matchesSearch(data[field.key], query));
}

/** Number of cells, across all rows and fields, that contain the search text */
export function countSearchMatches<TRecord>(
  rows: RowValidation<TRecord>[],
  fields: FieldKeys,
  query: string
): number {
  if (!query) return 0;
  let count = 0;
  for (const row of rows) {
    const data = cellValues(row);
    for (const field of fields) {
      if (matchesSearch(data[field.key], query)) count++;
    }
  }
  return count;
}

// ============================================================
// FIND & REPLACE
// ============================================================

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wholeWordPattern(text: string): string {
  return `\\b${escapeRegExp(text)}\\b`;
}

function inSelectedColumn(fieldKey: string, options: ReplaceOptions): boolean {
  return options.selectedColumn === 'all' || options.selectedColumn === fieldKey;
}

/** Whether a cell's text contains `find` under the case and whole-word options */
export function matchesFind(value: string, find: string, options: ReplaceOptions): boolean {
  if (!value || !find) return false;
  const searchFor = options.caseSensitive ? find : find.toLowerCase();

  if (options.wholeWord) {
    return new RegExp(wholeWordPattern(searchFor), options.caseSensitive ? '' : 'i').test(value);
  }

  const searchIn = options.caseSensitive ? value : value.toLowerCase();
  return searchIn.includes(searchFor);
}

/** Replace every occurrence of `find` in a cell's text under the case and whole-word options */
export function replaceInText(
  value: string,
  find: string,
  replace: string,
  options: ReplaceOptions
): string {
  const pattern = options.wholeWord ? wholeWordPattern(find) : escapeRegExp(find);
  return value.replace(new RegExp(pattern, options.caseSensitive ? 'g' : 'gi'), replace);
}

/** Number of cells, in the selected column(s), that find/replace would match */
export function countFindMatches<TRecord>(
  rows: RowValidation<TRecord>[],
  fields: FieldKeys,
  find: string,
  options: ReplaceOptions
): number {
  let count = 0;
  for (const row of rows) {
    const data = cellValues(row);
    for (const field of fields) {
      if (!inSelectedColumn(field.key, options)) continue;
      if (matchesFind(cellText(data[field.key]), find, options)) count++;
    }
  }
  return count;
}

/**
 * The edits a "replace all" makes: one change per cell whose text (see
 * `cellText`) actually changes. Values are the replaced text; applying the
 * edits coerces them to each field's type, so a date's `YYYY-MM-DD` text is
 * read back as a calendar date.
 */
export function findReplaceEdits<TRecord>(
  rows: RowValidation<TRecord>[],
  fields: FieldKeys,
  find: string,
  replace: string,
  options: ReplaceOptions
): RowEdit[] {
  const edits: RowEdit[] = [];

  for (const row of rows) {
    const data = cellValues(row);
    const changes: Record<string, unknown> = {};

    for (const field of fields) {
      if (!inSelectedColumn(field.key, options)) continue;
      const text = cellText(data[field.key]);
      if (!matchesFind(text, find, options)) continue;

      const replaced = replaceInText(text, find, replace, options);
      if (replaced !== text) changes[field.key] = replaced;
    }

    if (Object.keys(changes).length > 0) edits.push({ rowIndex: row.rowIndex, changes });
  }

  return edits;
}

/** Number of cells a set of edits changes */
export function countEditedCells(edits: RowEdit[]): number {
  return edits.reduce((count, edit) => count + Object.keys(edit.changes).length, 0);
}
