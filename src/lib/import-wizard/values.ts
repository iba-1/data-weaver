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

/** Which character separates a number's decimals: `1.5` or `1,5` */
export type DecimalSeparator = '.' | ',';

/** How a number cell was read */
export interface NumberReading {
  /** The number, or null for an empty cell or text that isn't a number */
  value: number | null;
  /**
   * The value is a single separator followed by exactly 3 digits (`1.500`,
   * `1,250`) and nothing said which separator is the decimal: it was read as
   * thousands, and the Importer should check it
   */
  ambiguous: boolean;
  /** The text is not a number (`1.50.0`, `12abc`): the cell keeps its text and is flagged */
  unreadable?: true;
}

type Shape =
  | { kind: 'integer' }
  | { kind: 'decimal'; decimal: DecimalSeparator }
  | { kind: 'thousands'; thousands: DecimalSeparator }
  | { kind: 'ambiguous'; separator: DecimalSeparator };

const SYMBOLS = /[$€£¥\s\u00a0\u202f]/g;
const other = (separator: DecimalSeparator): DecimalSeparator => (separator === '.' ? ',' : '.');
const count = (text: string, char: string) => text.split(char).length - 1;
const isGrouped = (groups: string[]) =>
  /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((group) => /^\d{3}$/.test(group));

/** What a number's separators say, or null when the text is not a number */
function shapeOf(body: string): Shape | null {
  if (!/^\d[\d.,]*$/.test(body) || !/\d$/.test(body)) return null;
  const dots = count(body, '.');
  const commas = count(body, ',');

  // Rule 1: both separators, the last one is the decimal
  if (dots > 0 && commas > 0) {
    const decimal: DecimalSeparator = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',';
    if (count(body, decimal) > 1) return null;
    const [integer] = body.split(decimal);
    return isGrouped(integer.split(other(decimal))) ? { kind: 'decimal', decimal } : null;
  }
  if (dots === 0 && commas === 0) return { kind: 'integer' };

  const separator: DecimalSeparator = dots > 0 ? '.' : ',';
  const groups = body.split(separator);
  // Rule 2: a repeated separator is for thousands
  if (groups.length > 2) return isGrouped(groups) ? { kind: 'thousands', thousands: separator } : null;

  const [integer, fraction] = groups;
  // Rule 4: exactly 3 digits after it, and an integer part that could be a thousands group
  if (fraction.length === 3 && /^\d{1,3}$/.test(integer) && !/^0+$/.test(integer)) {
    return { kind: 'ambiguous', separator };
  }
  // Rule 3: any other single separator is the decimal
  return { kind: 'decimal', decimal: separator };
}

const toNumber = (sign: string, body: string, decimal: DecimalSeparator | null) => {
  const plain = decimal
    ? body.split(other(decimal)).join('').replace(decimal, '.')
    : body.replace(/[.,]/g, '');
  return Number(`${sign}${plain}`);
};

/**
 * Read a number cell, with the decimal separator its column shows (see
 * `columnDecimal`) or null when the column shows none. Currency symbols and
 * spaces are ignored. Both separators: the last is the decimal (`1.500,00`,
 * `1,500.00`). A repeated one is for thousands (`1.500.000`). A single one
 * followed by anything but exactly 3 digits is the decimal (`1,5`, `1500.00`).
 * A single one followed by exactly 3 digits (`1.250`) follows the column, and
 * without it is read as thousands and flagged `ambiguous`.
 */
export function readNumber(text: string, decimal: DecimalSeparator | null): NumberReading {
  const cleaned = text.replace(SYMBOLS, '');
  if (cleaned === '') return { value: null, ambiguous: false };

  const match = /^(-?)(.*)$/.exec(cleaned);
  const sign = match?.[1] ?? '';
  const body = match?.[2] ?? '';
  const shape = shapeOf(body);
  if (!shape) return { value: null, ambiguous: false, unreadable: true };

  switch (shape.kind) {
    case 'integer':
      return { value: toNumber(sign, body, null), ambiguous: false };
    case 'decimal':
      return { value: toNumber(sign, body, shape.decimal), ambiguous: false };
    case 'thousands':
      return { value: toNumber(sign, body, other(shape.thousands)), ambiguous: false };
    case 'ambiguous':
      if (decimal === shape.separator) return { value: toNumber(sign, body, decimal), ambiguous: false };
      if (decimal) return { value: toNumber(sign, body, decimal), ambiguous: false };
      return { value: toNumber(sign, body, other(shape.separator)), ambiguous: true };
  }
}

/**
 * The decimal separator a column's values show, or null when none of them
 * shows it, or they contradict each other. Only values that settle it count:
 * both separators (`1.500,00`), a repeated one (`1.500.000` says `,`) or a
 * single one not followed by exactly 3 digits (`1,5`).
 */
export function columnDecimal(texts: string[]): DecimalSeparator | null {
  const seen = new Set<DecimalSeparator>();
  for (const text of texts) {
    const body = text.replace(SYMBOLS, '').replace(/^-/, '');
    const shape = body ? shapeOf(body) : null;
    if (shape?.kind === 'decimal') seen.add(shape.decimal);
    if (shape?.kind === 'thousands') seen.add(other(shape.thousands));
  }
  return seen.size === 1 ? [...seen][0] : null;
}

/**
 * Read a number the way spreadsheets write it, with no column to go by (see
 * `readNumber`). Returns null for an empty cell or text that isn't a number.
 */
export function parseNumber(text: string): number | null {
  return readNumber(text, null).value;
}
