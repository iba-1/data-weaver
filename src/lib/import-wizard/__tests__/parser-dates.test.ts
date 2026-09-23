/**
 * Dates must reach validation exactly as the spreadsheet shows them, never
 * reinterpreted by SheetJS in month-first order or local time.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseFile } from '../parser';
import { validateRows } from '../validator';
import type { ColumnMapping, FieldConfig } from '../types';

function csvFile(text: string): File {
  return { name: 'artworks.csv', text: async () => text } as unknown as File;
}

function excelFile(buffer: ArrayBuffer, name = 'artworks.xlsx'): File {
  return { name, arrayBuffer: async () => buffer } as unknown as File;
}

/** A workbook whose row 2 holds 15 Jan 2024 (serial 45306) in various date formats */
function workbookWithDates(bookType: XLSX.BookType, date1904 = false): ArrayBuffer {
  const offset = date1904 ? 1462 : 0;
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Default', 'Italian', 'With time', 'Number', 'Text'],
    [45306 - offset, 45306 - offset, 45306.4375 - offset, 45306, '15/01/2024'],
  ]);
  sheet['A2'].z = 'm/d/yy'; // Excel's built-in short date (format 14)
  sheet['B2'].z = 'dd/mm/yyyy';
  sheet['C2'].z = 'm/d/yy h:mm';
  sheet['D2'].z = '#,##0';
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Artworks');
  if (date1904) workbook.Workbook = { WBProps: { date1904: true } };
  return XLSX.write(workbook, { type: 'array', bookType }) as ArrayBuffer;
}

describe('parsing dates from Excel', () => {
  it.each(['xlsx', 'xls'] as const)('reads %s date cells as ISO calendar dates whatever their format', async (bookType) => {
    const parsed = await parseFile(excelFile(workbookWithDates(bookType), `artworks.${bookType}`));

    expect(parsed.rows).toEqual([
      {
        Default: '2024-01-15',
        Italian: '2024-01-15',
        'With time': '2024-01-15 10:30',
        Number: '45,306',
        Text: '15/01/2024',
      },
    ]);
  });

  it('reads workbooks using the 1904 date system', async () => {
    const parsed = await parseFile(excelFile(workbookWithDates('xlsx', true)));
    expect(parsed.rows[0].Default).toBe('2024-01-15');
    expect(parsed.rows[0]['With time']).toBe('2024-01-15 10:30');
  });

  it('validates every Excel date cell to the same UTC calendar date', async () => {
    const parsed = await parseFile(excelFile(workbookWithDates('xlsx')));
    const columns = ['Default', 'Italian', 'With time', 'Text'] as const;
    const fields: FieldConfig[] = columns.map((c) => ({ key: c, label: c, type: 'date' }));
    const mappings: ColumnMapping[] = columns.map((c) => ({
      sourceColumn: c,
      targetField: c,
      confidence: 1,
      isAutoMatched: true,
    }));

    const [row] = validateRows<Record<string, unknown>, string>(parsed.rows, mappings, { fields });

    expect(row.errors).toEqual([]);
    for (const column of columns) {
      expect((row.data[column] as Date).toISOString()).toBe('2024-01-15T00:00:00.000Z');
    }
  });
});

describe('parsing dates from CSV', () => {
  it('keeps cell text exactly as written', async () => {
    const parsed = await parseFile(
      csvFile('Italian,ISO,Ambiguous,Words,Inventory\n15/01/2024,2024-01-15,01/02/2024,Jan 15 2024,00123\n')
    );

    expect(parsed.rows).toEqual([
      {
        Italian: '15/01/2024',
        ISO: '2024-01-15',
        Ambiguous: '01/02/2024',
        Words: 'Jan 15 2024',
        Inventory: '00123',
      },
    ]);
  });

  it('reads an ambiguous CSV date day-first', async () => {
    const parsed = await parseFile(csvFile('Acquired\n01/02/2024\n'));
    const [row] = validateRows<Record<string, unknown>, string>(
      parsed.rows,
      [{ sourceColumn: 'Acquired', targetField: 'acquired', confidence: 1, isAutoMatched: true }],
      { fields: [{ key: 'acquired', label: 'Acquired', type: 'date' }] }
    );

    expect((row.data.acquired as Date).toISOString()).toBe('2024-02-01T00:00:00.000Z');
  });
});
