import * as XLSX from 'xlsx';
import type { ParsedFileData } from './types';

export async function parseFile(file: File): Promise<ParsedFileData> {
  const fileName = file.name;
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension === 'csv') {
    return parseCSV(file, fileName);
  } else if (extension === 'xlsx' || extension === 'xls') {
    return parseExcel(file, fileName);
  } else if (extension === 'pdf') {
    return parsePDF(file, fileName);
  }

  throw new Error(`Unsupported file type: ${extension}`);
}

async function parseCSV(file: File, fileName: string): Promise<ParsedFileData> {
  const text = await file.text();
  const workbook = XLSX.read(text, { type: 'string' });
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
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
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
    fileType: 'excel',
  };
}

async function parsePDF(_file: File, fileName: string): Promise<ParsedFileData> {
  // TODO: Implement PDF parsing with OpenRouter API
  // For now, return placeholder that indicates PDF needs special handling
  return {
    headers: [],
    rows: [],
    fileName,
    fileType: 'pdf',
  };
}

export function getFileTypeFromName(fileName: string): 'csv' | 'excel' | 'pdf' | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  if (extension === 'csv') return 'csv';
  if (extension === 'xlsx' || extension === 'xls') return 'excel';
  if (extension === 'pdf') return 'pdf';
  
  return null;
}

export function isValidFileType(fileName: string): boolean {
  return getFileTypeFromName(fileName) !== null;
}
