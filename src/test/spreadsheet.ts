/**
 * Reading back the spreadsheets Data Weaver writes, for tests. jsdom's Blob
 * has no `arrayBuffer()`, so its bytes are read with a FileReader.
 */

import * as XLSX from 'xlsx';

/** A Blob's bytes */
export function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** A spreadsheet file's first sheet: its name and its rows of cell text */
export async function readSheet(blob: Blob): Promise<{ sheetName: string; rows: string[][] }> {
  const workbook = XLSX.read(await blobBytes(blob), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], { header: 1, raw: false });
  return { sheetName, rows };
}
