import { describe, it, expect, vi } from 'vitest';
import { getFileTypeFromName, isValidFileType } from '../parser';

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

    it('should return "pdf" for .pdf files', () => {
      expect(getFileTypeFromName('document.pdf')).toBe('pdf');
      expect(getFileTypeFromName('report.PDF')).toBe('pdf');
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
      expect(isValidFileType('data.pdf')).toBe(true);
    });

    it('should return false for unsupported file types', () => {
      expect(isValidFileType('image.png')).toBe(false);
      expect(isValidFileType('document.docx')).toBe(false);
      expect(isValidFileType('noextension')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isValidFileType('DATA.CSV')).toBe(true);
      expect(isValidFileType('File.XLSX')).toBe(true);
    });
  });
});
