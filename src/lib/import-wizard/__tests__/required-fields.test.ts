import { describe, it, expect } from 'vitest';
import { validateRows, revalidateRow, getValidationSummary, resolveRequiredKeys } from '../validator';
import type { ColumnMapping, FieldConfig, RowValidation } from '../types';

type Key = 'name' | 'email';

const mappings: ColumnMapping<Key>[] = [
  { sourceColumn: 'Name', targetField: 'name', confidence: 1, isAutoMatched: true },
  { sourceColumn: 'Email', targetField: 'email', confidence: 1, isAutoMatched: true },
];

describe('required fields', () => {
  it('does not apply the artwork defaults to a custom Output Shape', () => {
    const fields: FieldConfig<Key>[] = [
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'email', label: 'Email', type: 'string' },
    ];

    const [row] = validateRows([{ Name: 'Ada', Email: '' }], mappings, { fields });

    expect(row.isValid).toBe(true);
    expect(row.errors).toEqual([]);
  });

  it('enforces FieldConfig.required without a requiredFields list', () => {
    const fields: FieldConfig<Key>[] = [
      { key: 'name', label: 'Name', type: 'string', required: true },
      { key: 'email', label: 'Email', type: 'string' },
    ];

    const [row] = validateRows([{ Name: '', Email: 'a@b.c' }], mappings, { fields });

    expect(row.isValid).toBe(false);
    expect(row.errors).toMatchObject([{ field: 'name', message: 'Name is required' }]);
  });

  it('combines FieldConfig.required with the requiredFields list', () => {
    const fields: FieldConfig<Key>[] = [
      { key: 'name', label: 'Name', type: 'string', required: true },
      { key: 'email', label: 'Email', type: 'string' },
    ];

    expect(resolveRequiredKeys(fields, ['email'])).toEqual(['name', 'email']);
  });

  it('revalidateRow uses the same rules after an edit', () => {
    const fields: FieldConfig<Key>[] = [
      { key: 'name', label: 'Name', type: 'string', required: true },
      { key: 'email', label: 'Email', type: 'string' },
    ];
    const row: RowValidation<Record<Key, unknown>> = {
      rowIndex: 0,
      data: { name: null, email: 'a@b.c' },
      originalData: {},
      isValid: true,
      errors: [],
      warnings: [],
    };

    const revalidated = revalidateRow(row, { fields });

    expect(revalidated.errors).toMatchObject([{ field: 'name', message: 'Name is required' }]);
  });

  it('keeps the legacy artwork rules only when no fields are given', () => {
    expect(resolveRequiredKeys(undefined, undefined)).toEqual(['title', 'artist']);
  });
});

describe('getValidationSummary with Excluded Rows', () => {
  const base = { originalData: {}, warnings: [], data: {} };

  it('counts Excluded Rows separately and never as errors', () => {
    const rows: RowValidation<Record<string, unknown>>[] = [
      { ...base, rowIndex: 0, isValid: true, errors: [] },
      { ...base, rowIndex: 1, isValid: false, errors: [{ field: 'x', message: 'bad' }] },
      { ...base, rowIndex: 2, isValid: false, errors: [{ field: 'x', message: 'bad' }], excluded: true },
    ];

    expect(getValidationSummary(rows)).toEqual({
      total: 3,
      valid: 1,
      withErrors: 1,
      withWarnings: 0,
      excluded: 1,
    });
  });
});
