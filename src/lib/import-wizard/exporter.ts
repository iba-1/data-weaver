import * as XLSX from 'xlsx';
import type { ColumnMapping, FieldConfig, ParsedFileData, RejectedRow, RowValidation } from './types';
import { ENGLISH_MESSAGES, type ResolvedMessages } from './messages';
import { normaliseFileTypes } from './parser';
import { cellText } from './values';

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

// ============================================================
// THE REJECTED ROWS, AS A SPREADSHEET TO FIX AND IMPORT AGAIN
// ============================================================

/** A spreadsheet format Data Weaver can write, by file extension */
export type SheetFormat = 'xlsx' | 'csv' | 'xls';

const MIME_TYPES: Record<SheetFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  xls: 'application/vnd.ms-excel',
};

export interface RejectedRowsSheetInput<TRecord> {
  /** The uploaded file: its headers and each data row's cell text, by `rowIndex` */
  file: Pick<ParsedFileData, 'headers' | 'rows'>;
  /** Which of the file's columns fed which field */
  mappings: ColumnMapping[];
  fields: Pick<FieldConfig, 'key' | 'label'>[];
  rejected: RejectedRow<TRecord>[];
  /**
   * Each row's record as the review first showed it, before the Importer
   * edited anything, by `rowIndex`. A field whose value differs from it was
   * edited. Without it, every mapped cell is written from the reviewed record.
   */
  unedited?: ReadonlyArray<TRecord | undefined>;
  /** For the error column's header and text; English by default */
  messages?: ResolvedMessages;
}

/** SheetJS names a column with no header `__EMPTY`, `__EMPTY_1`, … */
const NO_HEADER = /^__EMPTY(_\d+)?$/;

/**
 * The Rejected Rows as a sheet (header row first, every cell as text) the
 * Importer can fix in their spreadsheet program and upload again:
 *
 * - the file's own columns, in its order, under its own headers;
 * - each cell as uploaded, except a field the Importer edited in review,
 *   which is written, as text, into the column it came from. Columns not
 *   imported keep their text;
 * - a field no column fed, but that the Importer filled in on a Rejected Row,
 *   gets its own column, headed by the field's label, after the file's;
 * - last, an error column: the reason, with the field's label when given.
 *
 * Rows are in file order.
 */
export function rejectedRowsSheet<TRecord>({
  file,
  mappings,
  fields,
  rejected,
  unedited,
  messages = ENGLISH_MESSAGES,
}: RejectedRowsSheetInput<TRecord>): string[][] {
  const fieldOf = new Map<string, string>();
  for (const mapping of mappings) {
    if (mapping.targetField) fieldOf.set(mapping.sourceColumn, mapping.targetField);
  }
  const mappedFields = new Set(fieldOf.values());
  const valueOf = (record: TRecord | undefined, key: string) => (record as Record<string, unknown> | undefined)?.[key];
  const edited = (row: RejectedRow<TRecord>, key: string) =>
    !unedited || cellText(valueOf(row.record, key)) !== cellText(valueOf(unedited[row.rowIndex], key));

  const rows = [...rejected].sort((a, b) => a.rowIndex - b.rowIndex);
  // Fields the file had no column for, filled in during review on some Rejected Row
  const added = fields.filter(
    (field) =>
      !mappedFields.has(field.key) &&
      rows.some((row) => cellText(valueOf(row.record, field.key)) !== '' && edited(row, field.key))
  );
  const labelOf = (key: string) => fields.find((field) => field.key === key)?.label ?? key;

  const header = [
    ...file.headers.map((column) => (NO_HEADER.test(column) ? '' : column)),
    ...added.map((field) => field.label),
    messages.report.downloadErrorHeader(),
  ];

  const body = rows.map((row) => {
    const source = file.rows[row.rowIndex] ?? {};
    const cells = file.headers.map((column) => {
      const key = fieldOf.get(column);
      return key !== undefined && edited(row, key) ? cellText(valueOf(row.record, key)) : cellText(source[column]);
    });
    const error = row.field
      ? messages.report.downloadFieldError({ reason: row.reason, field: labelOf(row.field) })
      : messages.report.downloadError({ reason: row.reason });
    return [...cells, ...added.map((field) => cellText(valueOf(row.record, field.key))), error];
  });

  return [header, ...body];
}

/**
 * The format to download the Rejected Rows in, among those the upload step
 * accepts so the file can be imported again: Excel (.xlsx) when accepted,
 * since it keeps every cell as text (a CSV opened in Excel loses leading
 * zeros and re-reads dates), otherwise CSV, otherwise legacy Excel (.xls).
 */
export function rejectedRowsFormat(acceptedFileTypes: string[]): SheetFormat {
  const accepted = normaliseFileTypes(acceptedFileTypes);
  if (accepted.includes('.xlsx')) return 'xlsx';
  if (accepted.includes('.csv')) return 'csv';
  return accepted.includes('.xls') ? 'xls' : 'xlsx';
}

/** A sheet name Excel accepts: without `: \ / ? * [ ]`, at most 31 characters, not empty */
function safeSheetName(name: string): string {
  const safe = name.replace(/[:\\/?*[\]]/g, '').trim().slice(0, 31).trim();
  return safe === '' ? 'Sheet1' : safe;
}

/**
 * Write a sheet (rows of cells, header row first) as a spreadsheet file.
 * Strings stay text cells, so Excel keeps leading zeros and doesn't re-read
 * dates. CSV starts with a UTF-8 byte order mark so Excel reads accents.
 */
export function sheetToBlob(
  sheet: (string | number | null)[][],
  { sheetName, format }: { sheetName: string; format: SheetFormat }
): Blob {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet), safeSheetName(sheetName));
  const data = XLSX.write(workbook, { bookType: format, type: 'array' }) as ArrayBuffer;
  return new Blob([data], { type: MIME_TYPES[format] });
}
