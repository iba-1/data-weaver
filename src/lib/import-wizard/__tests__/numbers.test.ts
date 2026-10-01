import { describe, it, expect } from 'vitest';
import { columnDecimal, parseNumber, readNumber } from '../values';
import { revalidateRow, validateRows } from '../validator';
import { settleNumberColumns } from '../numberColumns';
import { applyRowEdits } from '../edits';
import type { ColumnMapping, FieldConfig, RowValidation } from '../types';

describe('readNumber: a value that says which separator is the decimal', () => {
  it.each([
    // Rule 1: both separators, the last one is the decimal
    ['1.500,00', 1500],
    ['1,500.00', 1500],
    ['-1.500,00', -1500],
    ['€ 1.234.567,89', 1234567.89],
    // Rule 2: a repeated separator is for thousands
    ['1.500.000', 1500000],
    ['1,500,000', 1500000],
    // Rule 3: a single separator not followed by exactly 3 digits is the decimal
    ['1,5', 1.5],
    ['1500,5', 1500.5],
    ['1500.00', 1500],
    ['12.5', 12.5],
    ['0,75', 0.75],
    // No separator
    ['1500', 1500],
    ['-12', -12],
    ['$ 42', 42],
    ['£1 000', 1000],
  ])('reads %s as %s, whatever the column says', (text, expected) => {
    for (const decimal of [null, '.', ','] as const) {
      expect(readNumber(text, decimal)).toEqual({ value: expected, ambiguous: false });
    }
  });

  it('reads a leading zero before 3 digits as a decimal: 0.500 is never thousands', () => {
    expect(readNumber('0.500', null)).toEqual({ value: 0.5, ambiguous: false });
    expect(readNumber('0,250', null)).toEqual({ value: 0.25, ambiguous: false });
  });
});

describe('readNumber: a single separator followed by exactly 3 digits (rule 4)', () => {
  it('follows the decimal separator the column shows', () => {
    expect(readNumber('1.250', '.')).toEqual({ value: 1.25, ambiguous: false });
    expect(readNumber('1.250', ',')).toEqual({ value: 1250, ambiguous: false });
    expect(readNumber('1,250', ',')).toEqual({ value: 1.25, ambiguous: false });
    expect(readNumber('1,250', '.')).toEqual({ value: 1250, ambiguous: false });
  });

  it('reads it as thousands, flagged as ambiguous, when the column shows nothing', () => {
    expect(readNumber('1.500', null)).toEqual({ value: 1500, ambiguous: true });
    expect(readNumber('1,500', null)).toEqual({ value: 1500, ambiguous: true });
  });
});

describe('readNumber: text that is not a number', () => {
  it.each(['1.50.0', '1,5,0', '1.000,5,3', '12abc', 'abc', 'N/A', '1.2.3,4.5', '--5', '5-'])(
    'can not read %j',
    (text) => {
      expect(readNumber(text, null)).toEqual({ value: null, ambiguous: false, unreadable: true });
    }
  );

  it('reads an empty cell as no number, not as an error', () => {
    expect(readNumber('', null)).toEqual({ value: null, ambiguous: false });
    expect(readNumber('  ', null)).toEqual({ value: null, ambiguous: false });
    expect(readNumber('$', null)).toEqual({ value: null, ambiguous: false });
  });
});

describe('columnDecimal', () => {
  it('finds the decimal separator from the values that show it', () => {
    expect(columnDecimal(['1.250', '1500.00'])).toBe('.');
    expect(columnDecimal(['1.250', '1.500,00'])).toBe(',');
    expect(columnDecimal(['1.250', '1,5'])).toBe(',');
    expect(columnDecimal(['1,250', '1.500.000'])).toBe(','); // dots repeated: thousands
    expect(columnDecimal(['1,250', '2,500,000'])).toBe('.');
  });

  it('knows nothing from values that show nothing, or that contradict each other', () => {
    expect(columnDecimal(['1.250', '1500', '', '2.500'])).toBeNull();
    expect(columnDecimal(['1,5', '2.5'])).toBeNull();
    expect(columnDecimal([])).toBeNull();
  });
});

describe('parseNumber', () => {
  it('applies the same rules without a column: 1.500,00 is 1500, not 1.5', () => {
    expect(parseNumber('1.500,00')).toBe(1500);
    expect(parseNumber('1.500')).toBe(1500);
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber('1.50.0')).toBeNull();
  });
});


const VALUE: FieldConfig<'value'> = { key: 'value', label: 'Value', type: 'number' };
const MAP: ColumnMapping<'value'>[] = [
  { sourceColumn: 'Value', targetField: 'value', confidence: 1, isAutoMatched: true },
];
type Row = { value: unknown };
const read = (cells: unknown[]) =>
  validateRows<Row, 'value'>(cells.map((Value) => ({ Value })), MAP, { fields: [VALUE] });
const values = (rows: RowValidation<Row>[]) => rows.map((r) => r.data.value);
const ambiguity = (row: RowValidation<Row>) =>
  row.warnings.filter((w) => w.messageRef?.key === 'ambiguousNumber');

describe('reading a file: numbers follow their column', () => {
  it('reads 1.500 as thousands in an Italian column, 1.25 in an English one', () => {
    expect(values(read(['1.500', '2.300,50']))).toEqual([1500, 2300.5]);
    expect(values(read(['1.250', '1500.75']))).toEqual([1.25, 1500.75]);
  });

  it('warns, without blocking, on a 1.500 the column says nothing about', () => {
    const [row] = read(['1.500', '1200']);
    expect(row.data.value).toBe(1500);
    expect(row.isValid).toBe(true);
    expect(ambiguity(row)).toEqual([
      expect.objectContaining({
        field: 'value',
        messageRef: { key: 'ambiguousNumber', params: { field: 'Value', text: '1.500', value: 1500 } },
      }),
    ]);
  });

  it('keeps an Excel number cell as it is', () => {
    const [row] = read([1250.123]);
    expect(row.data.value).toBe(1250.123);
    expect(ambiguity(row)).toEqual([]);
  });

  it('keeps text that is not a number, flagged as an error', () => {
    const [row] = read(['1.50.0']);
    expect(row.data.value).toBe('1.50.0');
    expect(row.isValid).toBe(false);
    expect(row.errors[0].messageRef).toEqual({ key: 'invalidNumber', params: { field: 'Value' } });
  });
});

describe('settleNumberColumns after a change in review', () => {
  const revalidate = (row: RowValidation<Row>) => revalidateRow<Row, 'value'>(row, { fields: [VALUE] });
  const edit = (rows: RowValidation<Row>[], rowIndex: number, text: string) => {
    const changed = applyRowEdits(rows, [{ rowIndex, changes: { value: text } }], [VALUE]);
    return settleNumberColumns(
      rows.map((row) => (changed.get(row.rowIndex) ? revalidate(changed.get(row.rowIndex)!) : row)),
      [VALUE],
      revalidate
    );
  };

  it('settles the other cells of the column when an edit shows the decimal separator', () => {
    const rows = read(['1.250', '']);
    expect(values(rows)).toEqual([1250, null]);

    const edited = edit(rows, 1, '3.75');

    expect(values(edited)).toEqual([1.25, 3.75]);
    expect(ambiguity(edited[0])).toEqual([]);
  });

  it("doesn't count excluded rows as evidence", () => {
    const rows = read(['1.250', '1500.75']);
    expect(values(rows)[0]).toBe(1.25);

    const excluded = settleNumberColumns(
      rows.map((row) => (row.rowIndex === 1 ? { ...row, excluded: true } : row)),
      [VALUE],
      revalidate
    );

    expect(values(excluded)[0]).toBe(1250);
    expect(ambiguity(excluded[0])).toHaveLength(1);
  });

  it('reads an edited cell from its new text, and forgets it when emptied', () => {
    const rows = read(['1.250', '2,5']);
    expect(values(rows)).toEqual([1250, 2.5]);

    expect(values(edit(rows, 1, ''))).toEqual([1250, null]);
    expect(edit(rows, 1, '')[1].numberTexts).toEqual({});
  });
});
