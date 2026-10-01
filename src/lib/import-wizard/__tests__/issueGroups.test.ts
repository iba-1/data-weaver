import { describe, it, expect } from 'vitest';
import type { ColumnMapping, FieldConfig, RowValidation } from '../types';
import { validateRows } from '../validator';
import { applyRowEdits } from '../edits';
import { revalidateRow } from '../validator';
import { blockedRowCount, groupIssues, numberExample, replacementEdits, rowHasIssue } from '../issueGroups';

type Key = 'title' | 'unit' | 'amount' | 'currency';
type Rec = Record<Key, unknown>;

const FIELDS: FieldConfig<Key>[] = [
  { key: 'title', label: 'Titolo', type: 'string', required: true },
  { key: 'unit', label: 'Unità di misura', type: 'choice', options: ['M', 'CM', 'MM'].map((v) => ({ value: v, label: v })) },
  { key: 'amount', label: 'Valore', type: 'number' },
  {
    key: 'currency',
    label: 'Valuta',
    type: 'choice',
    options: [{ value: 'EUR', label: 'Euro' }],
    validate: (value, row) =>
      !value && row.amount ? { type: 'warning', message: 'Valuta non indicata: verrà usato EUR.' } : null,
  },
];

const MAPPINGS: ColumnMapping<Key>[] = FIELDS.map((f) => ({
  sourceColumn: f.label,
  targetField: f.key,
  confidence: 1,
  isAutoMatched: true,
}));

function validate(rows: Array<[string, string, string, string]>): RowValidation<Rec>[] {
  return validateRows<Rec, Key>(
    rows.map(([title, unit, amount, currency]) => ({
      Titolo: title,
      'Unità di misura': unit,
      Valore: amount,
      Valuta: currency,
    })),
    MAPPINGS,
    { fields: FIELDS }
  );
}

/** As the review applies an edit: change the cells, then revalidate the changed rows */
function apply(rows: RowValidation<Rec>[], edits: ReturnType<typeof replacementEdits>) {
  const changed = applyRowEdits(rows, edits, FIELDS);
  return rows.map((row) => {
    const edited = changed.get(row.rowIndex);
    return edited ? revalidateRow<Rec, Key>(edited, { fields: FIELDS }) : row;
  });
}

const ROWS = validate([
  ['', 'metri', '100', 'EUR'], // 0: two errors
  ['Achrome', 'metri', '200', 'EUR'], // 1
  ['Notturno', 'CM', '300', ''], // 2: warning only
  ['', 'CM', '400', 'EUR'], // 3: missing title
  ['Linea', 'centimetri', '500', 'EUR'], // 4: another value, same cause
  ['Senza titolo', 'CM', 'circa 1800', 'EUR'], // 5: not a number
]);

describe('issue groups', () => {
  it('groups by field and cause, never by value: metri and centimetri are one group with two values', () => {
    const errors = groupIssues(ROWS, 'error');
    const unit = errors.find((g) => g.field === 'unit')!;

    expect(unit.cause).toBe('notAnOption');
    expect(unit.rowIndexes).toEqual([0, 1, 4]);
    expect(unit.values).toEqual([
      { text: 'metri', rowIndexes: [0, 1] },
      { text: 'centimetri', rowIndexes: [4] },
    ]);
    expect(errors.map((g) => [g.field, g.cause, g.rowIndexes.length])).toEqual([
      ['unit', 'notAnOption', 3],
      ['title', 'required', 2],
      ['amount', 'invalidNumber', 1],
    ]);
  });

  it('counts a row with two errors once in the blocked total, but in both groups', () => {
    const errors = groupIssues(ROWS, 'error');
    expect(blockedRowCount(ROWS)).toBe(5);
    expect(errors.filter((g) => g.rowIndexes.includes(0)).map((g) => g.field)).toEqual(['unit', 'title']);
  });

  it("groups the Host App's own rules by their message, and keeps warnings apart", () => {
    const warnings = groupIssues(ROWS, 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ field: 'currency', cause: 'host:Valuta non indicata: verrà usato EUR.', rowIndexes: [2] });
  });

  it('leaves excluded rows out of groups and of the blocked total', () => {
    const rows = ROWS.map((row) => (row.rowIndex === 1 ? { ...row, excluded: true } : row));
    expect(groupIssues(rows, 'error').find((g) => g.field === 'unit')!.rowIndexes).toEqual([0, 4]);
    expect(blockedRowCount(rows)).toBe(4);
  });
});

describe('replacing one value of a group', () => {
  const unit = { kind: 'error' as const, field: 'unit', cause: 'notAnOption' };

  it('edits only the included rows that still hold that value, and only that field', () => {
    const rows = ROWS.map((row) => (row.rowIndex === 1 ? { ...row, excluded: true } : row));
    const edits = replacementEdits(rows, unit, 'metri', 'M');

    expect(edits).toEqual([{ rowIndex: 0, changes: { unit: 'M' } }]);
  });

  it('keeps a different value of the same field for its own replacement', () => {
    expect(replacementEdits(ROWS, unit, 'centimetri', 'CM')).toEqual([{ rowIndex: 4, changes: { unit: 'CM' } }]);
  });

  it('leaves a row blocked by its other error, and the counts follow', () => {
    const fixed = apply(ROWS, replacementEdits(ROWS, unit, 'metri', 'M'));

    expect(rowHasIssue(fixed[0], unit)).toBe(false);
    expect(fixed[0].isValid).toBe(false);
    expect(fixed[0].errors.map((e) => e.field)).toEqual(['title']);
    expect(blockedRowCount(fixed)).toBe(4);
    expect(groupIssues(fixed, 'error').find((g) => g.field === 'unit')!.rowIndexes).toEqual([4]);
  });

  it('skips rows already fixed, so applying twice changes nothing more', () => {
    const fixed = apply(ROWS, replacementEdits(ROWS, unit, 'metri', 'M'));
    expect(replacementEdits(fixed, unit, 'metri', 'MM')).toEqual([]);
  });
});

describe('number examples', () => {
  it('offers the digits as an example, never as a correction', () => {
    expect(numberExample('circa 1800')).toBe('1800');
    expect(numberExample('settantasei')).toBeNull();
    expect(numberExample('ca. 1.500,50 €')).toBe('1.500,50');
  });
});
