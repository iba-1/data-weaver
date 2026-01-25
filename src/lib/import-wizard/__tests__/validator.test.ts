import { describe, it, expect, vi } from 'vitest';
import { validateRows, revalidateRow, getValidationSummary } from '../validator';
import type { ColumnMapping, FieldConfig, RowValidation } from '../types';

describe('validator', () => {
  const testFields: FieldConfig<'name' | 'email' | 'age'>[] = [
    { key: 'name', label: 'Name', type: 'string', required: true },
    { key: 'email', label: 'Email', type: 'string' },
    { key: 'age', label: 'Age', type: 'number' },
  ];

  const testMappings: ColumnMapping<'name' | 'email' | 'age'>[] = [
    { sourceColumn: 'Name', targetField: 'name', confidence: 1, isAutoMatched: true },
    { sourceColumn: 'Email', targetField: 'email', confidence: 1, isAutoMatched: true },
    { sourceColumn: 'Age', targetField: 'age', confidence: 1, isAutoMatched: true },
  ];

  describe('validateRows', () => {
    it('should validate rows with correct data', () => {
      const rows = [
        { Name: 'John Doe', Email: 'john@example.com', Age: '30' },
        { Name: 'Jane Smith', Email: 'jane@example.com', Age: '25' },
      ];

      const validated = validateRows(rows, testMappings, {
        fields: testFields,
        requiredFields: ['name'],
      });

      expect(validated).toHaveLength(2);
      expect(validated[0].isValid).toBe(true);
      expect(validated[1].isValid).toBe(true);
    });

    it('should mark rows with missing required fields as invalid', () => {
      const rows = [
        { Name: '', Email: 'john@example.com', Age: '30' },
        { Name: null, Email: 'jane@example.com', Age: '25' },
      ];

      const validated = validateRows(rows, testMappings, {
        fields: testFields,
        requiredFields: ['name'],
      });

      expect(validated[0].isValid).toBe(false);
      expect(validated[0].errors).toHaveLength(1);
      expect(validated[0].errors[0].field).toBe('name');

      expect(validated[1].isValid).toBe(false);
    });

    it('should parse number fields correctly', () => {
      const rows = [
        { Name: 'John', Email: 'john@example.com', Age: '30' },
        { Name: 'Jane', Email: 'jane@example.com', Age: '$1,500' },
      ];

      const validated = validateRows<{ name: string | null; email: string | null; age: number | null }, 'name' | 'email' | 'age'>(rows, testMappings, {
        fields: testFields,
        requiredFields: ['name'],
      });

      expect(validated[0].data.age).toBe(30);
      expect(validated[1].data.age).toBe(1500);
    });

    it('should handle null/empty number values', () => {
      const rows = [
        { Name: 'John', Email: 'john@example.com', Age: '' },
        { Name: 'Jane', Email: 'jane@example.com', Age: null },
      ];

      const validated = validateRows<{ name: string | null; email: string | null; age: number | null }, 'name' | 'email' | 'age'>(rows, testMappings, {
        fields: testFields,
        requiredFields: ['name'],
      });

      expect(validated[0].data.age).toBe(null);
      expect(validated[1].data.age).toBe(null);
    });

    it('should preserve original row index', () => {
      const rows = [
        { Name: 'John', Email: 'john@example.com', Age: '30' },
        { Name: 'Jane', Email: 'jane@example.com', Age: '25' },
      ];

      const validated = validateRows(rows, testMappings, {
        fields: testFields,
        requiredFields: ['name'],
      });

      expect(validated[0].rowIndex).toBe(0);
      expect(validated[1].rowIndex).toBe(1);
    });

    it('should preserve original data', () => {
      const rows = [
        { Name: 'John', Email: 'john@example.com', Age: '30', Extra: 'ignored' },
      ];

      const validated = validateRows(rows, testMappings, {
        fields: testFields,
        requiredFields: ['name'],
      });

      expect(validated[0].originalData).toEqual(rows[0]);
    });

    it('should call onRowParse callback for each row', () => {
      const rows = [
        { Name: 'John', Email: 'john@example.com', Age: '30' },
        { Name: 'Jane', Email: 'jane@example.com', Age: '25' },
      ];

      const onRowParse = vi.fn();

      validateRows(rows, testMappings, {
        fields: testFields,
        requiredFields: ['name'],
        onRowParse,
      });

      expect(onRowParse).toHaveBeenCalledTimes(2);
      expect(onRowParse).toHaveBeenCalledWith(0, rows[0], expect.any(Object));
      expect(onRowParse).toHaveBeenCalledWith(1, rows[1], expect.any(Object));
    });

    it('should allow onRowParse to transform data', () => {
      const rows = [
        { Name: 'john', Email: 'john@example.com', Age: '30' },
      ];

      type TestRecord = { name: string | null; email: string | null; age: number | null };

      const onRowParse = vi.fn((_index: number, _raw: Record<string, unknown>, parsed: TestRecord) => ({
        ...parsed,
        name: parsed.name ? parsed.name.toUpperCase() : null,
      }));

      const validated = validateRows<TestRecord, 'name' | 'email' | 'age'>(rows, testMappings, {
        fields: testFields,
        requiredFields: ['name'],
        onRowParse,
      });

      expect(validated[0].data.name).toBe('JOHN');
    });

    it('should run custom validator', () => {
      const rows = [
        { Name: 'John', Email: 'invalid-email', Age: '30' },
      ];

      const customValidator = vi.fn((data: Record<string, unknown>) => {
        if (data.email && !String(data.email).includes('@')) {
          return [{ type: 'error' as const, message: 'Invalid email format' }];
        }
        return [];
      });

      const validated = validateRows(rows, testMappings, {
        fields: testFields,
        requiredFields: ['name'],
        customValidator,
      });

      expect(validated[0].isValid).toBe(false);
      expect(validated[0].errors.some(e => e.message === 'Invalid email format')).toBe(true);
    });

    it('should run field-level validators', () => {
      const fieldsWithValidation: FieldConfig<'name' | 'email' | 'age'>[] = [
        { key: 'name', label: 'Name', type: 'string', required: true },
        { key: 'email', label: 'Email', type: 'string' },
        { 
          key: 'age', 
          label: 'Age', 
          type: 'number',
          validate: (value) => {
            if (value !== null && (value as number) < 0) {
              return { type: 'error', message: 'Age cannot be negative' };
            }
            return null;
          },
        },
      ];

      const rows = [
        { Name: 'John', Email: 'john@example.com', Age: '-5' },
      ];

      const validated = validateRows(rows, testMappings, {
        fields: fieldsWithValidation,
        requiredFields: ['name'],
      });

      expect(validated[0].isValid).toBe(false);
      expect(validated[0].errors.some(e => e.message === 'Age cannot be negative')).toBe(true);
    });

    it('should apply field transform functions', () => {
      const fieldsWithTransform: FieldConfig<'name' | 'email' | 'age'>[] = [
        { 
          key: 'name', 
          label: 'Name', 
          type: 'string', 
          required: true,
          transform: (value) => String(value).trim().toUpperCase(),
        },
        { key: 'email', label: 'Email', type: 'string' },
        { key: 'age', label: 'Age', type: 'number' },
      ];

      const rows = [
        { Name: '  john doe  ', Email: 'john@example.com', Age: '30' },
      ];

      type TestRecord = { name: string | null; email: string | null; age: number | null };

      const validated = validateRows<TestRecord, 'name' | 'email' | 'age'>(rows, testMappings, {
        fields: fieldsWithTransform,
        requiredFields: ['name'],
      });

      expect(validated[0].data.name).toBe('JOHN DOE');
    });
  });

  describe('revalidateRow', () => {
    it('should revalidate a row after editing', () => {
      const row: RowValidation<Record<string, unknown>> = {
        rowIndex: 0,
        data: { name: '', email: 'john@example.com', age: 30 },
        originalData: { Name: '', Email: 'john@example.com', Age: '30' },
        isValid: false,
        errors: [{ field: 'name', message: 'Name is required' }],
        warnings: [],
      };

      // Simulate editing the name
      const updatedRow: RowValidation<Record<string, unknown>> = {
        ...row,
        data: { ...row.data, name: 'John Doe' },
      };

      const revalidated = revalidateRow(updatedRow, {
        fields: testFields,
        requiredFields: ['name'],
      });

      expect(revalidated.isValid).toBe(true);
      expect(revalidated.errors).toHaveLength(0);
    });

    it('should add errors when required fields become empty', () => {
      const row: RowValidation<Record<string, unknown>> = {
        rowIndex: 0,
        data: { name: 'John', email: 'john@example.com', age: 30 },
        originalData: { Name: 'John', Email: 'john@example.com', Age: '30' },
        isValid: true,
        errors: [],
        warnings: [],
      };

      // Simulate clearing the name
      const updatedRow: RowValidation<Record<string, unknown>> = {
        ...row,
        data: { ...row.data, name: '' },
      };

      const revalidated = revalidateRow(updatedRow, {
        fields: testFields,
        requiredFields: ['name'],
      });

      expect(revalidated.isValid).toBe(false);
      expect(revalidated.errors).toHaveLength(1);
      expect(revalidated.errors[0].field).toBe('name');
    });

    it('should preserve rowIndex and originalData', () => {
      const row: RowValidation<Record<string, unknown>> = {
        rowIndex: 5,
        data: { name: 'John', email: 'john@example.com', age: 30 },
        originalData: { Name: 'John', Email: 'john@example.com', Age: '30' },
        isValid: true,
        errors: [],
        warnings: [],
      };

      const revalidated = revalidateRow(row, {
        fields: testFields,
        requiredFields: ['name'],
      });

      expect(revalidated.rowIndex).toBe(5);
      expect(revalidated.originalData).toEqual(row.originalData);
    });
  });

  describe('getValidationSummary', () => {
    it('should return correct counts', () => {
      const validations: RowValidation<Record<string, unknown>>[] = [
        { rowIndex: 0, data: {}, originalData: {}, isValid: true, errors: [], warnings: [] },
        { rowIndex: 1, data: {}, originalData: {}, isValid: true, errors: [], warnings: [] },
        { rowIndex: 2, data: {}, originalData: {}, isValid: true, errors: [], warnings: [{ field: 'age', message: 'warning' }] },
        { rowIndex: 3, data: {}, originalData: {}, isValid: false, errors: [{ field: 'name', message: 'error' }], warnings: [] },
      ];

      const summary = getValidationSummary(validations);

      expect(summary.total).toBe(4);
      expect(summary.valid).toBe(2); // Rows without errors AND without warnings
      expect(summary.withWarnings).toBe(1);
      expect(summary.withErrors).toBe(1);
    });

    it('should handle empty array', () => {
      const summary = getValidationSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.valid).toBe(0);
      expect(summary.withWarnings).toBe(0);
      expect(summary.withErrors).toBe(0);
    });

    it('should handle all valid rows', () => {
      const validations: RowValidation<Record<string, unknown>>[] = [
        { rowIndex: 0, data: {}, originalData: {}, isValid: true, errors: [], warnings: [] },
        { rowIndex: 1, data: {}, originalData: {}, isValid: true, errors: [], warnings: [] },
      ];

      const summary = getValidationSummary(validations);

      expect(summary.total).toBe(2);
      expect(summary.valid).toBe(2);
      expect(summary.withWarnings).toBe(0);
      expect(summary.withErrors).toBe(0);
    });

    it('should handle all invalid rows', () => {
      const validations: RowValidation<Record<string, unknown>>[] = [
        { rowIndex: 0, data: {}, originalData: {}, isValid: false, errors: [{ field: 'name', message: 'error' }], warnings: [] },
        { rowIndex: 1, data: {}, originalData: {}, isValid: false, errors: [{ field: 'email', message: 'error' }], warnings: [] },
      ];

      const summary = getValidationSummary(validations);

      expect(summary.total).toBe(2);
      expect(summary.valid).toBe(0);
      expect(summary.withWarnings).toBe(0);
      expect(summary.withErrors).toBe(2);
    });
  });
});
