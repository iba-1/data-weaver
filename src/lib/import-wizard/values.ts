/**
 * Rules for reading cell values, shared by file parsing and review edits so a
 * value means the same thing whether it came from the file or the Importer.
 */

import { formatCalendarDate } from './dates';

/**
 * How a cell reads as text: what the grid shows, what search and find/replace
 * match against, and what an edit starts from. Empty cells read as '', dates
 * as their calendar day (`YYYY-MM-DD`, never local time), anything else as
 * its plain text.
 */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatCalendarDate(value);
  return String(value);
}

/**
 * Read a number the way spreadsheets write it: currency symbols, thousands
 * separators and spaces are ignored. Returns null when no number is left.
 */
export function parseNumber(text: string): number | null {
  const parsed = parseFloat(text.replace(/[,$€£¥\s]/g, ''));
  return isNaN(parsed) ? null : parsed;
}
