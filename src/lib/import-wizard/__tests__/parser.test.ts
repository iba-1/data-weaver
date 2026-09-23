import { describe, it, expect, vi } from 'vitest';
import { checkUpload, getFileTypeFromName, isValidFileType, parseFile } from '../parser';

describe('parser', () => {
  describe('getFileTypeFromName', () => {
    it('should return "csv" for .csv files', () => {
      expect(getFileTypeFromName('data.csv')).toBe('csv');
      expect(getFileTypeFromName('my-file.CSV')).toBe('csv');
      expect(getFileTypeFromName('path/to/file.csv')).toBe('csv');
    });

    it('should return "excel" for .xlsx files', () => {
      expect(getFileTypeFromName('data.xlsx')).toBe('excel');
      expect(getFileTypeFromName('spreadsheet.XLSX')).toBe('excel');
    });

    it('should return "excel" for .xls files', () => {
      expect(getFileTypeFromName('legacy.xls')).toBe('excel');
      expect(getFileTypeFromName('old-file.XLS')).toBe('excel');
    });

    it('should return null for .pdf files (PDF is not supported)', () => {
      expect(getFileTypeFromName('document.pdf')).toBe(null);
      expect(getFileTypeFromName('report.PDF')).toBe(null);
    });

    it('should return null for unsupported file types', () => {
      expect(getFileTypeFromName('image.png')).toBe(null);
      expect(getFileTypeFromName('document.docx')).toBe(null);
      expect(getFileTypeFromName('script.js')).toBe(null);
      expect(getFileTypeFromName('noextension')).toBe(null);
    });

    it('should handle files with multiple dots', () => {
      expect(getFileTypeFromName('my.data.file.csv')).toBe('csv');
      expect(getFileTypeFromName('report.2024.xlsx')).toBe('excel');
    });
  });

  describe('isValidFileType', () => {
    it('should return true for supported file types', () => {
      expect(isValidFileType('data.csv')).toBe(true);
      expect(isValidFileType('data.xlsx')).toBe(true);
      expect(isValidFileType('data.xls')).toBe(true);
    });

    it('should return false for unsupported file types', () => {
      expect(isValidFileType('data.pdf')).toBe(false);
      expect(isValidFileType('data.tsv')).toBe(false);
      expect(isValidFileType('data.txt')).toBe(false);
      expect(isValidFileType('image.png')).toBe(false);
      expect(isValidFileType('document.docx')).toBe(false);
      expect(isValidFileType('noextension')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isValidFileType('DATA.CSV')).toBe(true);
      expect(isValidFileType('File.XLSX')).toBe(true);
    });
  });

  describe('parseFile', () => {
    it('rejects a PDF instead of returning an empty result', async () => {
      const pdf = new File(['%PDF-1.4'], 'catalogue.pdf', { type: 'application/pdf' });
      await expect(parseFile(pdf)).rejects.toThrow(/unsupported file type/i);
    });
  });

  describe('checkUpload', () => {
    const rules = { acceptedFileTypes: ['.csv', '.xlsx', '.xls'], maxFileSize: 1000 };

    it('accepts a file of an accepted type within the size limit', () => {
      expect(checkUpload({ name: 'people.CSV', size: 1000 }, rules)).toBeNull();
    });

    it('refuses a file larger than the limit, naming the limit', () => {
      expect(checkUpload({ name: 'people.csv', size: 1024 * 1024 + 1 }, { ...rules, maxFileSize: 1024 * 1024 })).toBe(
        'people.csv is too large. The maximum file size is 1 MB.'
      );
      expect(checkUpload({ name: 'people.csv', size: 2 * 1024 * 1024 }, { ...rules, maxFileSize: 1.5 * 1024 * 1024 })).toBe(
        'people.csv is too large. The maximum file size is 1.5 MB.'
      );
    });

    it('refuses a file type outside the accepted types, listing the accepted ones', () => {
      expect(checkUpload({ name: 'notes.txt', size: 10 }, rules)).toBe(
        'notes.txt is not a supported file type. You can upload: .csv, .xlsx, .xls'
      );
    });

    it('accepts types given without a dot or in upper case', () => {
      expect(checkUpload({ name: 'people.xlsx', size: 10 }, { ...rules, acceptedFileTypes: ['XLSX'] })).toBeNull();
    });
  });
});
