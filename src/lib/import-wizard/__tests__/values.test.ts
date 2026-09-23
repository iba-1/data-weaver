import { describe, it, expect } from 'vitest';
import { cellText, parseNumber } from '../values';
import { coerceEditedValue } from '../edits';
import { validateRows } from '../validator';
import type { ColumnMapping, FieldConfig } from '../types';

const PRICE: FieldConfig<'price'> = { key: 'price', label: 'Price', type: 'number' };
const MAPPING: ColumnMapping<'price'>[] = [
  { sourceColumn: 'Price', targetField: 'price', confidence: 1, isAutoMatched: true },
];

const parsedFromFile = (raw: string) =>
  validateRows<Record<string, unknown>, 'price'>([{ Price: raw }], MAPPING, { fields: [PRICE] })[0].data;

describe('parseNumber', () => {
  it.each([
    ['1234.5', 1234.5],
    ['$1,234.50', 1234.5],
    ['€ 99', 99],
    ['£1 000', 1000],
    ['¥500', 500],
    ['-12', -12],
    ['12abc', 12],
  ])('reads %s as %s', (text, expected) => {
    expect(parseNumber(text)).toBe(expected);
  });

  it.each(['', 'abc', 'N/A', '$'])('reads %j as no number', (text) => {
    expect(parseNumber(text)).toBeNull();
  });
});

describe('number rule shared by parsing and review edits', () => {
  it.each(['$1,234.50', ' 42 ', '€ 99', 'abc'])(
    'gives the same value for %j whether it came from the file or an edit',
    (text) => {
      expect(coerceEditedValue(text, PRICE)).toBe(parsedFromFile(text).price);
    }
  );
});

describe('coerceEditedValue', () => {
  it('turns an empty edit into null for any field type', () => {
    expect(coerceEditedValue('', { type: 'string' })).toBeNull();
    expect(coerceEditedValue('', PRICE)).toBeNull();
    expect(coerceEditedValue('')).toBeNull();
  });

  it('keeps non-string values and text for non-number fields as they are', () => {
    expect(coerceEditedValue(12, PRICE)).toBe(12);
    expect(coerceEditedValue('$5', { type: 'string' })).toBe('$5');
  });
});

describe('cellText', () => {
  it('reads empty cells as no text', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
  });

  it('reads a date as its calendar day, YYYY-MM-DD, whatever the time zone', () => {
    expect(cellText(new Date(Date.UTC(2024, 0, 15)))).toBe('2024-01-15');
    expect(cellText(new Date(Date.UTC(2024, 11, 31)))).toBe('2024-12-31');
  });

  it('reads anything else as its plain text', () => {
    expect(cellText('The Cat')).toBe('The Cat');
    expect(cellText(2100)).toBe('2100');
    expect(cellText(0)).toBe('0');
    expect(cellText(false)).toBe('false');
  });
});
