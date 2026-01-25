import { describe, it, expect } from 'vitest';
import { autoMatchColumns, getUnmappedTargetFields, updateMapping } from '../matcher';
import type { ColumnMapping, FieldConfig } from '../types';

describe('matcher', () => {
  const testFields: FieldConfig<'name' | 'email' | 'age' | 'city'>[] = [
    { key: 'name', label: 'Full Name', type: 'string', matchKeywords: ['name', 'fullname', 'person'] },
    { key: 'email', label: 'Email Address', type: 'string', matchKeywords: ['email', 'mail', 'e-mail'] },
    { key: 'age', label: 'Age', type: 'number', matchKeywords: ['age', 'years'] },
    { key: 'city', label: 'City', type: 'string', matchKeywords: ['city', 'location', 'town'] },
  ];

  describe('autoMatchColumns', () => {
    it('should auto-match columns with exact keyword matches', () => {
      const sourceColumns = ['name', 'email', 'age', 'city'];
      const mappings = autoMatchColumns(sourceColumns, testFields);

      expect(mappings).toHaveLength(4);
      expect(mappings.find(m => m.sourceColumn === 'name')?.targetField).toBe('name');
      expect(mappings.find(m => m.sourceColumn === 'email')?.targetField).toBe('email');
      expect(mappings.find(m => m.sourceColumn === 'age')?.targetField).toBe('age');
      expect(mappings.find(m => m.sourceColumn === 'city')?.targetField).toBe('city');
    });

    it('should auto-match columns with partial keyword matches', () => {
      const sourceColumns = ['fullname', 'e-mail', 'years_old', 'location'];
      const mappings = autoMatchColumns(sourceColumns, testFields);

      expect(mappings.find(m => m.sourceColumn === 'fullname')?.targetField).toBe('name');
      expect(mappings.find(m => m.sourceColumn === 'e-mail')?.targetField).toBe('email');
      expect(mappings.find(m => m.sourceColumn === 'location')?.targetField).toBe('city');
    });

    it('should mark auto-matched columns with isAutoMatched: true', () => {
      const sourceColumns = ['name', 'email'];
      const mappings = autoMatchColumns(sourceColumns, testFields);

      const nameMapping = mappings.find(m => m.sourceColumn === 'name');
      expect(nameMapping?.isAutoMatched).toBe(true);
      expect(nameMapping?.confidence).toBeGreaterThan(0.5);
    });

    it('should leave unmatched columns with targetField: null', () => {
      const sourceColumns = ['name', 'random_column', 'xyz'];
      const mappings = autoMatchColumns(sourceColumns, testFields);

      expect(mappings.find(m => m.sourceColumn === 'random_column')?.targetField).toBe(null);
      expect(mappings.find(m => m.sourceColumn === 'xyz')?.targetField).toBe(null);
    });

    it('should not duplicate target field assignments', () => {
      const sourceColumns = ['name', 'person_name', 'fullname'];
      const mappings = autoMatchColumns(sourceColumns, testFields);

      const nameAssignments = mappings.filter(m => m.targetField === 'name');
      expect(nameAssignments).toHaveLength(1);
    });

    it('should handle empty source columns', () => {
      const mappings = autoMatchColumns([], testFields);
      expect(mappings).toHaveLength(0);
    });

    it('should use label as fallback when no matchKeywords provided', () => {
      const fieldsWithoutKeywords: FieldConfig<'title'>[] = [
        { key: 'title', label: 'Title', type: 'string' },
      ];
      const sourceColumns = ['title'];
      const mappings = autoMatchColumns(sourceColumns, fieldsWithoutKeywords);

      expect(mappings.find(m => m.sourceColumn === 'title')?.targetField).toBe('title');
    });

    it('should be case-insensitive', () => {
      const sourceColumns = ['NAME', 'EMAIL', 'Age'];
      const mappings = autoMatchColumns(sourceColumns, testFields);

      expect(mappings.find(m => m.sourceColumn === 'NAME')?.targetField).toBe('name');
      expect(mappings.find(m => m.sourceColumn === 'EMAIL')?.targetField).toBe('email');
      expect(mappings.find(m => m.sourceColumn === 'Age')?.targetField).toBe('age');
    });
  });

  describe('getUnmappedTargetFields', () => {
    it('should return all fields when no mappings exist', () => {
      const mappings: ColumnMapping<'name' | 'email' | 'age' | 'city'>[] = [];
      const unmapped = getUnmappedTargetFields(mappings, testFields);

      expect(unmapped).toHaveLength(4);
    });

    it('should return only unmapped fields', () => {
      const mappings: ColumnMapping<'name' | 'email' | 'age' | 'city'>[] = [
        { sourceColumn: 'col1', targetField: 'name', confidence: 1, isAutoMatched: false },
        { sourceColumn: 'col2', targetField: 'email', confidence: 1, isAutoMatched: false },
      ];
      const unmapped = getUnmappedTargetFields(mappings, testFields);

      expect(unmapped).toHaveLength(2);
      expect(unmapped.map(f => f.key)).toContain('age');
      expect(unmapped.map(f => f.key)).toContain('city');
    });

    it('should return empty array when all fields are mapped', () => {
      const mappings: ColumnMapping<'name' | 'email' | 'age' | 'city'>[] = [
        { sourceColumn: 'col1', targetField: 'name', confidence: 1, isAutoMatched: false },
        { sourceColumn: 'col2', targetField: 'email', confidence: 1, isAutoMatched: false },
        { sourceColumn: 'col3', targetField: 'age', confidence: 1, isAutoMatched: false },
        { sourceColumn: 'col4', targetField: 'city', confidence: 1, isAutoMatched: false },
      ];
      const unmapped = getUnmappedTargetFields(mappings, testFields);

      expect(unmapped).toHaveLength(0);
    });

    it('should ignore mappings with null targetField', () => {
      const mappings: ColumnMapping<'name' | 'email' | 'age' | 'city'>[] = [
        { sourceColumn: 'col1', targetField: 'name', confidence: 1, isAutoMatched: false },
        { sourceColumn: 'col2', targetField: null, confidence: 0, isAutoMatched: false },
      ];
      const unmapped = getUnmappedTargetFields(mappings, testFields);

      expect(unmapped).toHaveLength(3);
    });
  });

  describe('updateMapping', () => {
    it('should update the target field for a source column', () => {
      const mappings: ColumnMapping<'name' | 'email'>[] = [
        { sourceColumn: 'col1', targetField: null, confidence: 0, isAutoMatched: false },
        { sourceColumn: 'col2', targetField: null, confidence: 0, isAutoMatched: false },
      ];

      const updated = updateMapping(mappings, 'col1', 'name');

      expect(updated.find(m => m.sourceColumn === 'col1')?.targetField).toBe('name');
    });

    it('should remove target field from previous mapping when reassigning', () => {
      const mappings: ColumnMapping<'name' | 'email'>[] = [
        { sourceColumn: 'col1', targetField: 'name', confidence: 1, isAutoMatched: true },
        { sourceColumn: 'col2', targetField: null, confidence: 0, isAutoMatched: false },
      ];

      const updated = updateMapping(mappings, 'col2', 'name');

      expect(updated.find(m => m.sourceColumn === 'col1')?.targetField).toBe(null);
      expect(updated.find(m => m.sourceColumn === 'col2')?.targetField).toBe('name');
    });

    it('should allow setting targetField to null', () => {
      const mappings: ColumnMapping<'name' | 'email'>[] = [
        { sourceColumn: 'col1', targetField: 'name', confidence: 1, isAutoMatched: true },
      ];

      const updated = updateMapping(mappings, 'col1', null);

      expect(updated.find(m => m.sourceColumn === 'col1')?.targetField).toBe(null);
    });

    it('should set confidence to 1 and isAutoMatched to false for manual updates', () => {
      const mappings: ColumnMapping<'name' | 'email'>[] = [
        { sourceColumn: 'col1', targetField: null, confidence: 0, isAutoMatched: false },
      ];

      const updated = updateMapping(mappings, 'col1', 'email');
      const mapping = updated.find(m => m.sourceColumn === 'col1');

      expect(mapping?.confidence).toBe(1);
      expect(mapping?.isAutoMatched).toBe(false);
    });
  });
});
