/**
 * Rules for reading cell values, shared by file parsing and review edits so a
 * value means the same thing whether it came from the file or the Importer.
 */

/**
 * Read a number the way spreadsheets write it: currency symbols, thousands
 * separators and spaces are ignored. Returns null when no number is left.
 */
export function parseNumber(text: string): number | null {
  const parsed = parseFloat(text.replace(/[,$€£¥\s]/g, ''));
  return isNaN(parsed) ? null : parsed;
}
