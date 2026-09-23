/**
 * Date parsing must give the same calendar day in every time zone.
 * Run under several zones with `npm run test:tz`.
 */
import { describe, it, expect } from 'vitest';
import { excelSerialToText, formatCalendarDate, parseCalendarDate } from '../dates';
import { validateRows, revalidateRow } from '../validator';
import { coerceEditedValue } from '../edits';
import type { ColumnMapping, FieldConfig } from '../types';

/** The UTC instant a parsed calendar date must be: midnight UTC of that day */
const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`).toISOString();
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value);

describe('test time zone', () => {
  it('runs in the zone requested via TZ', () => {
    if (!process.env.TZ) return;
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(process.env.TZ);
  });
});

describe('parseCalendarDate', () => {
  it.each([
    ['2024-01-15', '2024-01-15'],
    ['2024-1-5', '2024-01-05'],
    ['2024/01/15', '2024-01-15'],
    ['2024.01.15', '2024-01-15'],
    ['2024-01-15T23:30:00', '2024-01-15'],
    ['2024-01-15T23:30:00Z', '2024-01-15'],
    ['2024-01-15T00:00:00.000Z', '2024-01-15'],
    ['2024-01-15 10:30', '2024-01-15'],
    // The calendar date written in the cell wins over the offset
    ['2024-01-15T23:30:00-05:00', '2024-01-15'],
    ['2024-01-15T00:30:00+09:00', '2024-01-15'],
  ])('reads ISO %s as UTC calendar date %s', (input, expected) => {
    expect(iso(parseCalendarDate(input))).toBe(utc(expected));
  });

  it.each([
    ['15/01/2024', '2024-01-15'],
    ['15.01.2024', '2024-01-15'],
    ['15-01-2024', '2024-01-15'],
    ['5/1/2024', '2024-01-05'],
    ['01/02/2024', '2024-02-01'],
    ['15/01/2024 10:30', '2024-01-15'],
    ['15/01/2024 10:30:15', '2024-01-15'],
    ['29/02/2024', '2024-02-29'],
    ['31/12/1899', '1899-12-31'],
  ])('reads %s day-first as %s', (input, expected) => {
    expect(iso(parseCalendarDate(input))).toBe(utc(expected));
  });

  it('reads month-first when the field asks for MDY', () => {
    expect(iso(parseCalendarDate('01/02/2024', 'MDY'))).toBe(utc('2024-01-02'));
    expect(iso(parseCalendarDate('1/15/2024', 'MDY'))).toBe(utc('2024-01-15'));
    // ISO stays year-month-day whatever the order
    expect(iso(parseCalendarDate('2024-01-02', 'MDY'))).toBe(utc('2024-01-02'));
  });

  it('handles years before 100 without shifting them to the 1900s', () => {
    expect(iso(parseCalendarDate('0050-03-01'))).toBe('0050-03-01T00:00:00.000Z');
  });

  it.each([
    '31/02/2024', // impossible day
    '29/02/2023', // not a leap year
    '15/13/2024', // no month 13
    '00/01/2024',
    '2024-02-30',
    '2024-13-01',
    '1/15/2024', // month-first under the day-first rule
    '15/01/24', // two-digit year is ambiguous (1924 or 2024?)
    '15/01-2024', // mixed separators
    '2024-01-15T25:00',
    '2024-01-15T10:60',
    'Jan 15 2024',
    '15 gennaio 2024',
    'not a date',
    '45306',
    '2024',
  ])('rejects %s', (input) => {
    expect(parseCalendarDate(input)).toBeNull();
  });

  it('keeps a valid Date and rejects an invalid one', () => {
    const date = new Date('2024-01-15T00:00:00.000Z');
    expect(parseCalendarDate(date)).toBe(date);
    expect(parseCalendarDate(new Date('nope'))).toBeNull();
  });
});

describe('formatCalendarDate', () => {
  it('shows the UTC calendar date', () => {
    expect(formatCalendarDate(new Date('2024-01-15T00:00:00.000Z'))).toBe('2024-01-15');
    expect(formatCalendarDate(new Date('0050-03-01T00:00:00.000Z'))).toBe('0050-03-01');
  });

  it('round-trips through parseCalendarDate', () => {
    const parsed = parseCalendarDate('15/01/2024') as Date;
    expect(iso(parseCalendarDate(formatCalendarDate(parsed)))).toBe(parsed.toISOString());
  });
});

describe('excelSerialToText', () => {
  it.each([
    [45306, false, '2024-01-15'],
    [45306.4375, false, '2024-01-15 10:30'],
    [45306.43751157, false, '2024-01-15 10:30:01'],
    [45306.99999999, false, '2024-01-16'], // rounds to midnight of the next day
    [61, false, '1900-03-01'],
    [59, false, '1900-02-28'],
    [1, false, '1900-01-01'],
    [43844, true, '2024-01-15'], // 1904 date system
  ])('converts serial %s (1904: %s) to %s', (serial, date1904, expected) => {
    expect(excelSerialToText(serial, date1904)).toBe(expected);
  });

  it('leaves serials it cannot map to a calendar day alone', () => {
    expect(excelSerialToText(60, false)).toBeNull(); // Excel's fictitious 29 Feb 1900
    expect(excelSerialToText(0.5, false)).toBeNull(); // a time of day only
    expect(excelSerialToText(-1, false)).toBeNull();
    expect(excelSerialToText(Number.NaN, false)).toBeNull();
  });
});

type Key = 'title' | 'acquired';

const fields: FieldConfig<Key>[] = [
  { key: 'title', label: 'Title', type: 'string' },
  { key: 'acquired', label: 'Acquired', type: 'date' },
];

const mappings: ColumnMapping<Key>[] = [
  { sourceColumn: 'Title', targetField: 'title', confidence: 1, isAutoMatched: true },
  { sourceColumn: 'Acquired', targetField: 'acquired', confidence: 1, isAutoMatched: true },
];

const validate = (acquired: unknown, fieldConfigs: FieldConfig<Key>[] = fields) =>
  validateRows<Record<Key, unknown>, Key>([{ Title: 'Concetto spaziale', Acquired: acquired }], mappings, {
    fields: fieldConfigs,
  })[0];

describe('date fields in validation', () => {
  it.each([
    ['2024-01-15', '2024-01-15'],
    ['15/01/2024', '2024-01-15'],
    ['15.01.2024', '2024-01-15'],
    [' 01/02/2024 ', '2024-02-01'],
  ])('parses %s to the UTC calendar date %s', (input, expected) => {
    const row = validate(input);
    expect(row.errors).toEqual([]);
    expect(iso(row.data.acquired)).toBe(utc(expected));
  });

  it('honours a field set to month-first', () => {
    const row = validate('01/02/2024', [fields[0], { ...fields[1], dateOrder: 'MDY' }]);
    expect(iso(row.data.acquired)).toBe(utc('2024-01-02'));
  });

  it('flags an impossible date as a cell error and keeps what was typed', () => {
    const row = validate('31/02/2024');
    expect(row.isValid).toBe(false);
    expect(row.errors).toEqual([
      { field: 'acquired', message: 'Acquired is not a valid date (use DD/MM/YYYY or YYYY-MM-DD)' },
    ]);
    expect(row.data.acquired).toBe('31/02/2024');
  });

  it('describes the expected format of a month-first field', () => {
    const row = validate('13/01/2024', [fields[0], { ...fields[1], dateOrder: 'MDY' }]);
    expect(row.errors).toEqual([
      { field: 'acquired', message: 'Acquired is not a valid date (use MM/DD/YYYY or YYYY-MM-DD)' },
    ]);
  });

  it('flags an unparseable date on a required field once, as not a valid date', () => {
    const row = validate('sometime in 2024', [fields[0], { ...fields[1], required: true }]);
    expect(row.errors).toEqual([
      { field: 'acquired', message: 'Acquired is not a valid date (use DD/MM/YYYY or YYYY-MM-DD)' },
    ]);
  });

  it('does not run the field transform on an invalid date', () => {
    let calls = 0;
    const transform = (value: unknown) => {
      calls++;
      return value;
    };
    validate('31/02/2024', [fields[0], { ...fields[1], transform }]);
    expect(calls).toBe(0);
    validate('15/01/2024', [fields[0], { ...fields[1], transform }]);
    expect(calls).toBe(1);
  });

  it('keeps an empty cell empty', () => {
    for (const empty of ['', '   ', null, undefined]) {
      const row = validate(empty);
      expect(row.errors).toEqual([]);
      expect(row.data.acquired).toBeNull();
    }
  });

  it('still requires an empty required date', () => {
    const row = validate('', [fields[0], { ...fields[1], required: true }]);
    expect(row.errors).toEqual([{ field: 'acquired', message: 'Acquired is required' }]);
  });

  it('clears the error once the Importer fixes the date', () => {
    const row = validate('31/02/2024');
    const edited = {
      ...row,
      data: { ...row.data, acquired: coerceEditedValue('28/02/2024', fields[1]) },
    };
    const revalidated = revalidateRow<Record<Key, unknown>, Key>(edited, { fields });
    expect(revalidated.isValid).toBe(true);
    expect(iso(revalidated.data.acquired)).toBe(utc('2024-02-28'));
  });

  it('keeps flagging the date after an unrelated edit', () => {
    const row = validate('31/02/2024');
    const edited = { ...row, data: { ...row.data, title: 'Attese' } };
    const revalidated = revalidateRow<Record<Key, unknown>, Key>(edited, { fields });
    expect(revalidated.errors).toEqual([
      { field: 'acquired', message: 'Acquired is not a valid date (use DD/MM/YYYY or YYYY-MM-DD)' },
    ]);
  });
});

describe('coerceEditedValue for dates', () => {
  const field = { type: 'date' as const };

  it('parses typed dates to UTC calendar dates', () => {
    expect(iso(coerceEditedValue('15/01/2024', field))).toBe(utc('2024-01-15'));
    expect(iso(coerceEditedValue('2024-01-15', field))).toBe(utc('2024-01-15'));
    expect(iso(coerceEditedValue('01/02/2024', { type: 'date', dateOrder: 'MDY' }))).toBe(utc('2024-01-02'));
  });

  it('reads AI Edit ISO timestamps as their calendar date', () => {
    expect(iso(coerceEditedValue('2024-01-15T00:00:00.000Z', field))).toBe(utc('2024-01-15'));
  });

  it('keeps unparseable text so validation can flag it', () => {
    expect(coerceEditedValue(' 31/02/2024 ', field)).toBe('31/02/2024');
  });

  it('empties a cleared date', () => {
    expect(coerceEditedValue('', field)).toBeNull();
    expect(coerceEditedValue('  ', field)).toBeNull();
  });
});
