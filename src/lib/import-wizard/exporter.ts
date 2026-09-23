import * as XLSX from 'xlsx';
import type { FieldConfig, RowValidation } from './types';

export interface ExportOptions {
  filename?: string;
  /** Name of the workbook's sheet (Excel) */
  sheetName?: string;
  format?: 'csv' | 'xlsx';
  includeHeaders?: boolean;
  onlyValid?: boolean;
}

/**
 * Export validated rows to CSV or Excel format
 */
export function exportData<TRecord, TKey extends string>(
  rows: RowValidation<TRecord>[],
  fields: FieldConfig<TKey>[],
  options: ExportOptions = {}
): void {
  const {
    filename = 'export',
    sheetName = 'Data',
    format = 'csv',
    includeHeaders = true,
    onlyValid = false,
  } = options;

  // Filter rows if needed
  const dataRows = onlyValid ? rows.filter((r) => r.isValid) : rows;

  // Build data array
  const data: (string | number | null)[][] = [];

  // Add headers
  if (includeHeaders) {
    data.push(fields.map((f) => f.label));
  }

  // Add data rows
  for (const row of dataRows) {
    const rowData = row.data as Record<string, unknown>;
    const values = fields.map((field) => {
      const value = rowData[field.key];
      if (value === null || value === undefined) return '';
      if (value instanceof Date) return value.toISOString();
      return value as string | number;
    });
    data.push(values);
  }

  // Create workbook
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Set column widths based on content
  const colWidths = fields.map((field, idx) => {
    const maxLength = Math.max(
      field.label.length,
      ...dataRows.map((row) => {
        const value = (row.data as Record<string, unknown>)[field.key];
        return String(value ?? '').length;
      })
    );
    return { wch: Math.min(maxLength + 2, 50) };
  });
  worksheet['!cols'] = colWidths;

  // Export
  if (format === 'xlsx') {
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  } else {
    XLSX.writeFile(workbook, `${filename}.csv`, { bookType: 'csv' });
  }
}

/**
 * Generate a blob URL for download (for custom download handling)
 */
export function exportToBlob<TRecord, TKey extends string>(
  rows: RowValidation<TRecord>[],
  fields: FieldConfig<TKey>[],
  options: Omit<ExportOptions, 'filename'> = {}
): Blob {
  const { format = 'csv', sheetName = 'Data', includeHeaders = true, onlyValid = false } = options;

  const dataRows = onlyValid ? rows.filter((r) => r.isValid) : rows;
  const data: (string | number | null)[][] = [];

  if (includeHeaders) {
    data.push(fields.map((f) => f.label));
  }

  for (const row of dataRows) {
    const rowData = row.data as Record<string, unknown>;
    const values = fields.map((field) => {
      const value = rowData[field.key];
      if (value === null || value === undefined) return '';
      if (value instanceof Date) return value.toISOString();
      return value as string | number;
    });
    data.push(values);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const mimeType =
    format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';

  const arrayBuffer = XLSX.write(workbook, {
    bookType: format === 'xlsx' ? 'xlsx' : 'csv',
    type: 'array',
  });

  return new Blob([arrayBuffer], { type: mimeType });
}
