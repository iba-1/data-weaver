import { describe, it, expect } from 'vitest';
import {
  countEditedCells,
  countFindMatches,
  countSearchMatches,
  findReplaceEdits,
  matchesFind,
  matchesSearch,
  replaceInText,
  rowMatchesSearch,
} from '../search';
import { applyRowEdits } from '../edits';
import type { FieldConfig, ReplaceOptions, RowValidation } from '../types';

type Rec = Record<string, unknown>;

const FIELDS: FieldConfig[] = [
  { key: 'title', label: 'Title', type: 'string' },
  { key: 'artist', label: 'Artist', type: 'string' },
  { key: 'price', label: 'Price', type: 'number' },
];

function row(rowIndex: number, data: Rec): RowValidation<Rec> {
  return { rowIndex, data, originalData: {}, isValid: true, errors: [], warnings: [] };
}

const ROWS = [
  row(0, { title: 'The Cat', artist: 'Anna Catt', price: 100 }),
  row(1, { title: 'Concatenate', artist: null, price: 2100 }),
  row(2, { title: 'cat', artist: 'Bob', price: undefined }),
];

const opts = (overrides: Partial<ReplaceOptions> = {}): ReplaceOptions => ({
  caseSensitive: false,
  wholeWord: false,
  selectedColumn: 'all',
  ...overrides,
});

describe('search', () => {
  it('matches cell text ignoring case, and never matches empty cells or an empty query', () => {
    expect(matchesSearch('The Cat', 'cat')).toBe(true);
    expect(matchesSearch(2100, '10')).toBe(true);
    expect(matchesSearch(null, 'cat')).toBe(false);
    expect(matchesSearch(undefined, 'cat')).toBe(false);
    expect(matchesSearch('The Cat', '')).toBe(false);
  });

  it('keeps every row for an empty query, and rows with any matching field otherwise', () => {
    expect(ROWS.filter((r) => rowMatchesSearch(r, FIELDS, ''))).toHaveLength(3);
    expect(ROWS.filter((r) => rowMatchesSearch(r, FIELDS, 'bob')).map((r) => r.rowIndex)).toEqual([2]);
  });

  it('counts matching cells, not rows', () => {
    expect(countSearchMatches(ROWS, FIELDS, 'cat')).toBe(4);
    expect(countSearchMatches(ROWS, FIELDS, '')).toBe(0);
  });

  it('only searches the given fields', () => {
    expect(countSearchMatches(ROWS, [{ key: 'artist' }], 'cat')).toBe(1);
  });
});

describe('matchesFind', () => {
  it('ignores case unless case-sensitive', () => {
    expect(matchesFind('The Cat', 'cat', opts())).toBe(true);
    expect(matchesFind('The Cat', 'cat', opts({ caseSensitive: true }))).toBe(false);
    expect(matchesFind('The Cat', 'Cat', opts({ caseSensitive: true }))).toBe(true);
  });

  it('matches only whole words when asked', () => {
    expect(matchesFind('Concatenate', 'cat', opts())).toBe(true);
    expect(matchesFind('Concatenate', 'cat', opts({ wholeWord: true }))).toBe(false);
    expect(matchesFind('The Cat', 'cat', opts({ wholeWord: true }))).toBe(true);
    expect(matchesFind('The Cat', 'cat', opts({ wholeWord: true, caseSensitive: true }))).toBe(false);
  });

  it('treats regex characters in the find text literally', () => {
    expect(matchesFind('Price (USD)', '(USD)', opts())).toBe(true);
    expect(matchesFind('a.c', '.', opts())).toBe(true);
    expect(matchesFind('abc', '.', opts())).toBe(false);
    expect(matchesFind('1+1', '1+1', opts({ wholeWord: true }))).toBe(true);
    expect(matchesFind('11', '1+1', opts({ wholeWord: true }))).toBe(false);
  });

  it('never matches empty text or an empty find', () => {
    expect(matchesFind('', 'cat', opts())).toBe(false);
    expect(matchesFind('cat', '', opts())).toBe(false);
  });
});

describe('replaceInText', () => {
  it('replaces every occurrence, ignoring case unless case-sensitive', () => {
    expect(replaceInText('Cat cat CAT', 'cat', 'dog', opts())).toBe('dog dog dog');
    expect(replaceInText('Cat cat CAT', 'cat', 'dog', opts({ caseSensitive: true }))).toBe('Cat dog CAT');
  });

  it('leaves partial words alone in whole-word mode', () => {
    expect(replaceInText('cat concatenate', 'cat', 'dog', opts({ wholeWord: true }))).toBe(
      'dog concatenate'
    );
  });

  it('treats regex characters in the find text literally', () => {
    expect(replaceInText('a.b.c', '.', '-', opts())).toBe('a-b-c');
    expect(replaceInText('$100 (est.)', '(est.)', '', opts())).toBe('$100 ');
  });
});

describe('countFindMatches', () => {
  it('counts matching cells across all columns', () => {
    expect(countFindMatches(ROWS, FIELDS, 'cat', opts())).toBe(4);
  });

  it('respects the selected column', () => {
    expect(countFindMatches(ROWS, FIELDS, 'cat', opts({ selectedColumn: 'artist' }))).toBe(1);
    expect(countFindMatches(ROWS, FIELDS, 'cat', opts({ selectedColumn: 'title' }))).toBe(3);
  });

  it('matches numbers by their text', () => {
    expect(countFindMatches(ROWS, FIELDS, '100', opts())).toBe(2);
  });

  it('combines whole-word and case-sensitive options', () => {
    expect(countFindMatches(ROWS, FIELDS, 'cat', opts({ wholeWord: true }))).toBe(2);
    expect(countFindMatches(ROWS, FIELDS, 'cat', opts({ wholeWord: true, caseSensitive: true }))).toBe(1);
  });
});

describe('findReplaceEdits', () => {
  it('produces one change per cell that actually changes, grouped by row', () => {
    const edits = findReplaceEdits(ROWS, FIELDS, 'cat', 'dog', opts());

    expect(edits).toEqual([
      { rowIndex: 0, changes: { title: 'The dog', artist: 'Anna dogt' } },
      { rowIndex: 1, changes: { title: 'Condogenate' } },
      { rowIndex: 2, changes: { title: 'dog' } },
    ]);
    expect(countEditedCells(edits)).toBe(4);
  });

  it('only touches the selected column', () => {
    expect(findReplaceEdits(ROWS, FIELDS, 'cat', 'dog', opts({ selectedColumn: 'artist' }))).toEqual([
      { rowIndex: 0, changes: { artist: 'Anna dogt' } },
    ]);
  });

  it('skips cells whose text would not change', () => {
    expect(findReplaceEdits(ROWS, FIELDS, 'cat', 'cat', opts({ caseSensitive: true }))).toEqual([]);
  });

  it('returns nothing when nothing matches', () => {
    const edits = findReplaceEdits(ROWS, FIELDS, 'zebra', 'dog', opts());
    expect(edits).toEqual([]);
    expect(countEditedCells(edits)).toBe(0);
  });

  it('yields text that applying the edits coerces to the field type', () => {
    const edits = findReplaceEdits(ROWS, FIELDS, '100', '1,000', opts({ selectedColumn: 'price' }));
    expect(edits).toEqual([
      { rowIndex: 0, changes: { price: '1,000' } },
      { rowIndex: 1, changes: { price: '21,000' } },
    ]);

    const changed = applyRowEdits(ROWS, edits, FIELDS);
    expect(changed.get(0)?.data.price).toBe(1000);
    expect(changed.get(1)?.data.price).toBe(21000);
  });

  it('replacing with nothing empties a cell, which becomes null once applied', () => {
    const edits = findReplaceEdits(ROWS, FIELDS, 'bob', '', opts({ selectedColumn: 'artist' }));
    expect(edits).toEqual([{ rowIndex: 2, changes: { artist: '' } }]);
    expect(applyRowEdits(ROWS, edits, FIELDS).get(2)?.data.artist).toBeNull();
  });
});
