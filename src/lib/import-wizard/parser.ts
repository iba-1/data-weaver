import * as XLSX from 'xlsx';
import type { ParsedFileData } from './types';
import { excelSerialToText } from './dates';

/** File types the upload step accepts unless the Host App narrows them */
export const DEFAULT_ACCEPTED_FILE_TYPES = ['.csv', '.xlsx', '.xls'];

/** Largest file the upload step accepts unless the Host App changes it: 10 MB */
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function parseFile(file: File): Promise<ParsedFileData> {
  const fileName = file.name;
  const fileType = getFileTypeFromName(fileName);

  if (fileType === 'csv') return parseCSV(file, fileName);
  if (fileType === 'excel') return parseExcel(file, fileName);

  throw new Error(`Unsupported file type: ${getExtension(fileName) || fileName}`);
}

async function parseCSV(file: File, fileName: string): Promise<ParsedFileData> {
  const text = await file.text();
  // raw: keep every cell's text as written. Otherwise SheetJS guesses dates
  // month-first in local time (01/02/2024 becomes 2 January) and drops
  // leading zeros; values are typed later, per field, by the validator.
  const workbook = XLSX.read(text, { type: 'string', raw: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false
  });

  const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

  return {
    headers,
    rows: jsonData,
    fileName,
    fileType: 'csv',
  };
}

async function parseExcel(file: File, fileName: string): Promise<ParsedFileData> {
  const arrayBuffer = await file.arrayBuffer();
  // cellNF keeps each cell's number format, needed to tell dates from numbers
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellNF: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  writeDatesAsIso(sheet, Boolean(workbook.Workbook?.WBProps?.date1904));

  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false
  });

  const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

  return {
    headers,
    rows: jsonData,
    fileName,
    fileType: 'excel',
  };
}

/** Lower-case extension without the dot, or '' when the name has none */
function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Excel stores a date as a serial number and shows it through a number
 * format; Excel's default one renders month-first with a two-digit year
 * (1/15/24). Replace the shown text of every date cell with an unambiguous
 * ISO date computed from the serial, so it reads the same in every locale
 * and time zone.
 */
function writeDatesAsIso(sheet: XLSX.WorkSheet, date1904: boolean): void {
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!')) continue;
    const { t, v, z } = cell as XLSX.CellObject;
    if (t !== 'n' || typeof v !== 'number' || z === undefined || !XLSX.SSF.is_date(z)) continue;
    const text = excelSerialToText(v, date1904);
    if (text !== null) (cell as XLSX.CellObject).w = text;
  }
}

export function getFileTypeFromName(fileName: string): ParsedFileData['fileType'] | null {
  const extension = getExtension(fileName);

  if (extension === 'csv') return 'csv';
  if (extension === 'xlsx' || extension === 'xls') return 'excel';

  return null;
}

/** Whether the parser can read this file type (.csv, .xlsx or .xls) */
export function isValidFileType(fileName: string): boolean {
  return getFileTypeFromName(fileName) !== null;
}

export interface UploadRules {
  /** Accepted extensions, e.g. `['.csv', '.xlsx']`; the dot and case are optional */
  acceptedFileTypes: string[];
  /** Maximum size in bytes */
  maxFileSize: number;
}

/** `'.csv'`, `'CSV'` and `'csv'` all become `'.csv'` */
export function normaliseFileTypes(fileTypes: string[]): string[] {
  return fileTypes.map((type) => {
    const lower = type.trim().toLowerCase();
    return lower.startsWith('.') ? lower : `.${lower}`;
  });
}

/** Human-readable size with at most one decimal, e.g. `10 MB`, `1.5 MB`, `512 KB` */
export function formatFileSize(bytes: number): string {
  const MB = 1024 * 1024;
  if (bytes >= MB) return `${Number((bytes / MB).toFixed(1))} MB`;
  if (bytes >= 1024) return `${Number((bytes / 1024).toFixed(1))} KB`;
  return `${bytes} bytes`;
}

/**
 * Checks a file against the upload step's rules before it is parsed.
 * @returns a message for the Importer when the file is refused, otherwise null
 */
export function checkUpload(file: Pick<File, 'name' | 'size'>, rules: UploadRules): string | null {
  const accepted = normaliseFileTypes(rules.acceptedFileTypes);
  const extension = getExtension(file.name);

  if (!extension || !accepted.includes(`.${extension}`)) {
    return `${file.name} is not a supported file type. You can upload: ${accepted.join(', ')}`;
  }

  if (file.size > rules.maxFileSize) {
    return `${file.name} is too large. The maximum file size is ${formatFileSize(rules.maxFileSize)}.`;
  }

  return null;
}
