/**
 * Calendar dates, read the same way in every time zone.
 *
 * A date field holds a calendar day, not an instant. It is represented as a
 * `Date` at midnight UTC of that day, and only ever built from its year, month
 * and day with UTC arithmetic: nothing here reads or writes local time.
 */

/** How an ambiguous numeric date such as 01/02/2024 is read */
export type DateOrder = 'DMY' | 'MDY';

export const DEFAULT_DATE_ORDER: DateOrder = 'DMY';

const MS_PER_DAY = 86_400_000;

// Optional time after a date. It is validated but does not change the day.
const TIME = String.raw`(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*(?:Z|[+-]\d{2}(?::?\d{2})?)?)?`;
// Year first: 2024-01-15, 2024/01/15, 2024.01.15 (+ optional time)
const YEAR_FIRST = new RegExp(String.raw`^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})${TIME}$`);
// Day or month first with a four-digit year: 15/01/2024, 15.01.2024, 15-01-2024
const YEAR_LAST = new RegExp(String.raw`^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})${TIME}$`);

/**
 * Read a cell value as a calendar date.
 *
 * - Year-first dates (ISO `YYYY-MM-DD`, also with `/` or `.`) are read as
 *   written. A time, and any offset after it, is ignored: the day written in
 *   the cell is the day stored.
 * - Other numeric dates need a four-digit year and are read day-first
 *   (`DD/MM/YYYY`, `DD.MM.YYYY`, `DD-MM-YYYY`), or month-first when `order`
 *   is `'MDY'`.
 * - Anything else, including impossible days like 31/02/2024, two-digit
 *   years and month names, is not a date.
 *
 * @returns a `Date` at midnight UTC, or `null` when the value is not a date
 */
export function parseCalendarDate(value: unknown, order: DateOrder = DEFAULT_DATE_ORDER): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;

  const text = value.trim();

  const yearFirst = text.match(YEAR_FIRST);
  if (yearFirst) {
    const [, year, , month, day, hours, minutes, seconds] = yearFirst;
    return isValidTime(hours, minutes, seconds) ? calendarDate(+year, +month, +day) : null;
  }

  const yearLast = text.match(YEAR_LAST);
  if (yearLast) {
    const [, first, , second, year, hours, minutes, seconds] = yearLast;
    const [day, month] = order === 'MDY' ? [second, first] : [first, second];
    return isValidTime(hours, minutes, seconds) ? calendarDate(+year, +month, +day) : null;
  }

  return null;
}

/** Show a calendar date as `YYYY-MM-DD` */
export function formatCalendarDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The message shown on a cell that is not a valid date */
export function invalidDateMessage(label: string, order: DateOrder = DEFAULT_DATE_ORDER): string {
  const numeric = order === 'MDY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY';
  return `${label} is not a valid date (use ${numeric} or YYYY-MM-DD)`;
}

/**
 * Turn an Excel date serial into `YYYY-MM-DD`, or `YYYY-MM-DD HH:MM[:SS]` when
 * it has a time of day, using the workbook's date system.
 *
 * @returns `null` for serials that are not a calendar day: a time of day on
 *   its own, or Excel's fictitious 29 February 1900
 */
export function excelSerialToText(serial: number, date1904: boolean): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;

  let days = Math.floor(serial);
  let seconds = Math.round((serial - days) * 86_400);
  if (seconds === 86_400) {
    days += 1;
    seconds = 0;
  }

  let epoch: number;
  if (date1904) {
    epoch = Date.UTC(1904, 0, 1);
  } else if (days === 60) {
    return null; // Excel treats 1900 as a leap year; 29/02/1900 never existed
  } else {
    // Serial 1 is 1900-01-01; serials after the phantom leap day are one day ahead
    epoch = days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  }

  const date = formatCalendarDate(new Date(epoch + days * MS_PER_DAY));
  if (seconds === 0) return date;

  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const ss = seconds % 60;
  return `${date} ${hh}:${mm}${ss ? `:${String(ss).padStart(2, '0')}` : ''}`;
}

function calendarDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(2000, month - 1, day));
  // Date.UTC maps years 0-99 to 1900-1999, so set the year separately
  date.setUTCFullYear(year, month - 1, day);
  const matches =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return matches ? date : null;
}

function isValidTime(hours?: string, minutes?: string, seconds?: string): boolean {
  if (hours === undefined) return true;
  return Number(hours) < 24 && Number(minutes) < 60 && (seconds === undefined || Number(seconds) < 60);
}
