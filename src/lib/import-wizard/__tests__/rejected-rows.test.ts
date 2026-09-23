import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { rejectedRowsFormat, rejectedRowsSheet, sheetToBlob } from '../exporter';
import { resolveMessages } from '../messages';
import type { ColumnMapping, FieldConfig, RejectedRow } from '../types';
import { blobBytes, readSheet } from '@/test/spreadsheet';

type Key = 'title' | 'year' | 'acquired' | 'notes';
type Rec = Record<Key, unknown>;

const FIELDS: FieldConfig<Key>[] = [
  { key: 'title', label: 'Title', type: 'string' },
  { key: 'year', label: 'Year', type: 'number' },
  { key: 'acquired', label: 'Acquired', type: 'date' },
  { key: 'notes', label: 'Notes', type: 'string' },
];

/** The Importer's file: its own headers, one column not imported ("Shelf"), `notes` not in the file */
const FILE = {
  headers: ['Titolo', 'Anno', 'Shelf', 'Acquisito'],
  rows: [
    { Titolo: 'Achrome', Anno: '1,958', Shelf: 'A-01', Acquisito: '15/01/2024' },
    { Titolo: 'Concetto spaziale', Anno: '1960', Shelf: 'B-02', Acquisito: null },
    { Titolo: 'Nature morte', Anno: '1955', Shelf: '007', Acquisito: '2024-02-01' },
  ],
};

const MAPPINGS: ColumnMapping<Key>[] = [
  { sourceColumn: 'Titolo', targetField: 'title', confidence: 1, isAutoMatched: true },
  { sourceColumn: 'Anno', targetField: 'year', confidence: 1, isAutoMatched: true },
  { sourceColumn: 'Shelf', targetField: null, confidence: 0, isAutoMatched: false },
  { sourceColumn: 'Acquisito', targetField: 'acquired', confidence: 1, isAutoMatched: true },
];

/** Each row's record as the review first showed it, by rowIndex */
const UNEDITED: Rec[] = [
  { title: 'Achrome', year: 1958, acquired: new Date(Date.UTC(2024, 0, 15)), notes: null },
  { title: 'Concetto spaziale', year: 1960, acquired: null, notes: null },
  { title: 'Nature morte', year: 1955, acquired: new Date(Date.UTC(2024, 1, 1)), notes: null },
];

function rejected(rowIndex: number, record: Rec, reason: string, field?: Key): RejectedRow<Rec> {
  return { importKey: `key-${rowIndex}`, rowIndex, record, reason, ...(field && { field }), cause: 'host' };
}

describe('rejectedRowsSheet', () => {
  it('writes the file’s own headers and cell text, plus an error column, for the Rejected Rows only', () => {
    const sheet = rejectedRowsSheet({
      file: FILE,
      mappings: MAPPINGS,
      fields: FIELDS,
      rejected: [rejected(0, UNEDITED[0], 'Already in the collection', 'title'), rejected(2, UNEDITED[2], 'The collection is full')],
      unedited: UNEDITED,
    });

    expect(sheet).toEqual([
      ['Titolo', 'Anno', 'Shelf', 'Acquisito', 'Error'],
      // Unedited cells keep the text as uploaded ("1,958", "15/01/2024"), not the converted value
      ['Achrome', '1,958', 'A-01', '15/01/2024', 'Title: Already in the collection'],
      ['Nature morte', '1955', '007', '2024-02-01', 'The collection is full'],
    ]);
  });

  it('writes the values the Importer edited in review into the columns they came from', () => {
    const edited: Rec = { title: 'Concetto spaziale, 1960', year: 1961, acquired: new Date(Date.UTC(2023, 11, 31)), notes: null };
    const sheet = rejectedRowsSheet({
      file: FILE,
      mappings: MAPPINGS,
      fields: FIELDS,
      rejected: [rejected(1, edited, 'Duplicate')],
      unedited: UNEDITED,
    });

    expect(sheet[1]).toEqual(['Concetto spaziale, 1960', '1961', 'B-02', '2023-12-31', 'Duplicate']);
  });

  it('adds a column, headed by the field’s label, for a field not in the file that the Importer filled in', () => {
    const sheet = rejectedRowsSheet({
      file: FILE,
      mappings: MAPPINGS,
      fields: FIELDS,
      rejected: [
        rejected(0, UNEDITED[0], 'Duplicate'),
        rejected(1, { ...UNEDITED[1], notes: 'On loan' }, 'Duplicate'),
      ],
      unedited: UNEDITED,
    });

    expect(sheet).toEqual([
      ['Titolo', 'Anno', 'Shelf', 'Acquisito', 'Notes', 'Error'],
      ['Achrome', '1,958', 'A-01', '15/01/2024', '', 'Duplicate'],
      ['Concetto spaziale', '1960', 'B-02', '', 'On loan', 'Duplicate'],
    ]);
  });

  it('lists the rows in file order, whatever order they were rejected in', () => {
    const sheet = rejectedRowsSheet({
      file: FILE,
      mappings: MAPPINGS,
      fields: FIELDS,
      rejected: [rejected(2, UNEDITED[2], 'Third'), rejected(0, UNEDITED[0], 'First')],
      unedited: UNEDITED,
    });

    expect(sheet.slice(1).map((row) => row.at(-1))).toEqual(['First', 'Third']);
  });

  it('writes the reviewed value of every mapped cell when the unedited records are not given', () => {
    const sheet = rejectedRowsSheet({
      file: FILE,
      mappings: MAPPINGS,
      fields: FIELDS,
      rejected: [rejected(0, UNEDITED[0], 'Duplicate')],
    });

    expect(sheet[1]).toEqual(['Achrome', '1958', 'A-01', '2024-01-15', 'Duplicate']);
  });

  it('leaves a column the file had no header for without one', () => {
    const sheet = rejectedRowsSheet({
      file: { headers: ['Titolo', '__EMPTY'], rows: [{ Titolo: 'Achrome', __EMPTY: 'x' }] },
      mappings: [{ sourceColumn: 'Titolo', targetField: 'title', confidence: 1, isAutoMatched: true }],
      fields: FIELDS,
      rejected: [rejected(0, UNEDITED[0], 'Duplicate')],
      unedited: UNEDITED,
    });

    expect(sheet).toEqual([
      ['Titolo', '', 'Error'],
      ['Achrome', 'x', 'Duplicate'],
    ]);
  });

  it('takes the error column’s header and text from the message catalogue', () => {
    const messages = resolveMessages({
      report: {
        downloadErrorHeader: 'Errore',
        downloadError: 'Scartata: {reason}',
        downloadFieldError: ({ field, reason }) => `${reason} (${field})`,
      },
    });
    const sheet = rejectedRowsSheet({
      file: FILE,
      mappings: MAPPINGS,
      fields: FIELDS,
      rejected: [rejected(0, UNEDITED[0], 'Doppione', 'title'), rejected(1, UNEDITED[1], 'Piena')],
      unedited: UNEDITED,
      messages,
    });

    expect(sheet.map((row) => row.at(-1))).toEqual(['Errore', 'Doppione (Title)', 'Scartata: Piena']);
  });
});

describe('rejectedRowsFormat', () => {
  it('is Excel (.xlsx) whenever the upload step accepts it', () => {
    expect(rejectedRowsFormat(['.csv', '.xlsx', '.xls'])).toBe('xlsx');
    expect(rejectedRowsFormat(['XLSX'])).toBe('xlsx');
  });

  it('is a format the upload step accepts, so the file can be imported again', () => {
    expect(rejectedRowsFormat(['.csv'])).toBe('csv');
    expect(rejectedRowsFormat(['.xls', '.csv'])).toBe('csv');
    expect(rejectedRowsFormat(['.xls'])).toBe('xls');
  });
});

describe('sheetToBlob', () => {
  const SHEET = [
    ['Titolo', 'Anno', 'Error'],
    ['Café', '007', 'Duplicate'],
  ];

  const readBack = readSheet;

  it('writes an Excel workbook with every cell as text, on the named sheet', async () => {
    const blob = sheetToBlob(SHEET, { sheetName: 'Rejected rows', format: 'xlsx' });

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(await readBack(blob)).toEqual({ sheetName: 'Rejected rows', rows: SHEET });
    // Text cells, so Excel keeps "007" as written
    const workbook = XLSX.read(await blobBytes(blob), { type: 'array' });
    expect(workbook.Sheets['Rejected rows'].B2).toMatchObject({ t: 's', v: '007' });
  });

  it('writes CSV that Excel reads as UTF-8', async () => {
    const blob = sheetToBlob(SHEET, { sheetName: 'Rejected rows', format: 'csv' });
    const bytes = await blobBytes(blob);

    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe('Titolo,Anno,Error\nCafé,007,Duplicate');
  });

  it('makes a sheet name Excel accepts out of any text', async () => {
    const blob = sheetToBlob(SHEET, { sheetName: 'Righe scartate: 2024/01 [bozza] e altre cose ancora', format: 'xlsx' });
    expect((await readBack(blob)).sheetName).toBe('Righe scartate 202401 bozza e a');

    const unnamed = sheetToBlob(SHEET, { sheetName: ' :/ ', format: 'xlsx' });
    expect((await readBack(unnamed)).sheetName).toBe('Sheet1');
  });
});
