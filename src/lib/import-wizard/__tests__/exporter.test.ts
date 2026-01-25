import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToBlob } from '../exporter';
import type { FieldConfig, RowValidation } from '../types';

// Mock XLSX write function
vi.mock('xlsx', async () => {
  const actual = await vi.importActual('xlsx');
  return {
    ...actual as object,
    writeFile: vi.fn(),
  };
});

describe('exporter', () => {
  const testFields: FieldConfig<'name' | 'email' | 'age'>[] = [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'email', label: 'Email', type: 'string' },
    { key: 'age', label: 'Age', type: 'number' },
  ];

  const testRows: RowValidation<Record<string, unknown>>[] = [
    {
      rowIndex: 0,
      data: { name: 'John Doe', email: 'john@example.com', age: 30 },
      originalData: {},
      isValid: true,
      errors: [],
      warnings: [],
    },
    {
      rowIndex: 1,
      data: { name: 'Jane Smith', email: 'jane@example.com', age: 25 },
      originalData: {},
      isValid: true,
      errors: [],
      warnings: [],
    },
    {
      rowIndex: 2,
      data: { name: '', email: 'invalid@example.com', age: null },
      originalData: {},
      isValid: false,
      errors: [{ field: 'name', message: 'Name is required' }],
      warnings: [],
    },
  ];

  describe('exportToBlob', () => {
    it('should return a Blob', () => {
      const blob = exportToBlob(testRows, testFields);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('should create CSV blob by default', () => {
      const blob = exportToBlob(testRows, testFields);
      expect(blob.type).toBe('text/csv');
    });

    it('should create Excel blob when format is xlsx', () => {
      const blob = exportToBlob(testRows, testFields, { format: 'xlsx' });
      expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    it('should filter to only valid rows when onlyValid is true', () => {
      const allBlob = exportToBlob(testRows, testFields);
      const validOnlyBlob = exportToBlob(testRows, testFields, { onlyValid: true });
      
      // Valid-only should be smaller (fewer rows)
      expect(validOnlyBlob.size).toBeLessThan(allBlob.size);
    });

    it('should include headers by default', () => {
      const withHeaders = exportToBlob(testRows.slice(0, 1), testFields);
      const withoutHeaders = exportToBlob(testRows.slice(0, 1), testFields, { includeHeaders: false });
      
      // With headers should be larger
      expect(withHeaders.size).toBeGreaterThan(withoutHeaders.size);
    });

    it('should handle empty rows array', () => {
      const blob = exportToBlob([], testFields);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('should handle null values in data', () => {
      const rowsWithNull: RowValidation<Record<string, unknown>>[] = [
        {
          rowIndex: 0,
          data: { name: 'John', email: null, age: null },
          originalData: {},
          isValid: true,
          errors: [],
          warnings: [],
        },
      ];

      const blob = exportToBlob(rowsWithNull, testFields);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('should handle Date values', () => {
      const fieldsWithDate: FieldConfig<'name' | 'createdAt'>[] = [
        { key: 'name', label: 'Name', type: 'string' },
        { key: 'createdAt', label: 'Created At', type: 'date' },
      ];

      const rowsWithDate: RowValidation<Record<string, unknown>>[] = [
        {
          rowIndex: 0,
          data: { name: 'John', createdAt: new Date('2024-01-15') },
          originalData: {},
          isValid: true,
          errors: [],
          warnings: [],
        },
      ];

      const blob = exportToBlob(rowsWithDate, fieldsWithDate);
      expect(blob).toBeInstanceOf(Blob);
    });
  });
});
