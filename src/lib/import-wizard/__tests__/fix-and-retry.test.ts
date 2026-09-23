import { describe, it, expect } from 'vitest';
import { collectRelatedValues, relatedValueKey, resolveValues, type LookupResults } from '../resolution';
import { createdRelatedIds, linkAlreadyCreated, planRelatedCreations, undecidedValuesOnly } from '../related';
import { importReport } from '../commit';
import type { FieldConfig, ImportRow, RejectedRow } from '../types';

type Key = 'title' | 'author' | 'lender';
type Rec = Record<Key, unknown>;

const FIELDS: FieldConfig<Key>[] = [
  { key: 'title', label: 'Title', type: 'string' },
  { key: 'author', label: 'Author', type: 'string', relationship: { kind: 'registry' } },
  { key: 'lender', label: 'Lender', type: 'string', relationship: { kind: 'registry' } },
];

function row(rowIndex: number, data: Partial<Rec>) {
  return { rowIndex, data: { title: null, author: null, lender: null, ...data } };
}

const nothingFound = (...values: string[]): LookupResults => new Map([['registry', new Map(values.map((v) => [v, []]))]]);

describe('reusing Related Records created by an earlier Commit', () => {
  const resolved = resolveValues(
    collectRelatedValues([row(0, { author: 'Galleria Nuova', lender: 'G. Nuova' }), row(1, { author: 'Piero Manzoni' })], FIELDS),
    nothingFound('galleria nuova', 'g. nuova', 'piero manzoni'),
    // The Importer gave G. Nuova the same name as Galleria Nuova: one record
    { names: new Map([[relatedValueKey('registry', 'g. nuova'), 'galleria  NUOVA']]) }
  );

  it('keeps the IDs of the records created, by kind and Normalised Match of their name, leaving out failures', () => {
    const ids = createdRelatedIds([
      { kind: 'registry', name: 'Galleria Nuova', keys: [], id: 'reg-1' },
      { kind: 'registry', name: 'Piero Manzoni', keys: [], reason: 'Registry unavailable' },
    ]);
    expect([...ids]).toEqual([[relatedValueKey('registry', 'galleria nuova'), 'reg-1']]);
  });

  it('links every value whose record was created, so it is never planned again; failures are planned again', () => {
    const ids = createdRelatedIds([{ kind: 'registry', name: 'Galleria Nuova', keys: [], id: 'reg-1' }]);
    const linked = linkAlreadyCreated(resolved, ids);

    expect(linked.map((v) => [v.value, v.decision])).toEqual([
      ['galleria nuova', { action: 'link', id: 'reg-1', name: 'Galleria Nuova' }],
      ['g. nuova', { action: 'link', id: 'reg-1', name: 'galleria  NUOVA' }],
      ['piero manzoni', { action: 'create', name: 'Piero Manzoni' }],
    ]);
    expect(planRelatedCreations(linked).map((c) => c.name)).toEqual(['Piero Manzoni']);
  });

  it('never links across kinds', () => {
    const ids = createdRelatedIds([{ kind: 'place', name: 'Galleria Nuova', keys: [], id: 'place-1' }]);
    expect(linkAlreadyCreated(resolved, ids)).toEqual(resolved);
  });
});

describe('the values Resolution still needs in Fix & Retry', () => {
  it('empties the Relationship Field values already decided, keeping new ones and every other field', () => {
    const decided = new Map([[relatedValueKey('registry', 'galleria nuova'), true]]);
    const rows = [row(3, { title: 'Achrome', author: 'galleria  Nuova', lender: 'Piero Manzoni' })];

    const undecided = undecidedValuesOnly(rows, FIELDS, decided);

    expect(undecided).toEqual([{ rowIndex: 3, data: { title: 'Achrome', author: '', lender: 'Piero Manzoni' } }]);
    expect(rows[0].data.author).toBe('galleria  Nuova');
    expect(collectRelatedValues(undecided, FIELDS).map((v) => v.value)).toEqual(['piero manzoni']);
  });
});

describe('the Import Report after Fix & Retry', () => {
  const imported = (rowIndex: number): ImportRow<Rec> => ({ importKey: `k${rowIndex}`, rowIndex, record: row(rowIndex, {}).data });
  const rejected = (rowIndex: number, reason: string): RejectedRow<Rec> => ({ ...imported(rowIndex), reason, cause: 'host' });

  it('adds the retry’s outcomes to the rows created and excluded before, in file order', () => {
    const first = { created: [imported(0), imported(4)], rejected: [rejected(1, 'a'), rejected(2, 'b'), rejected(3, 'c')], excluded: [imported(5)] };

    const report = importReport({ created: [imported(3), imported(1)], rejected: [rejected(2, 'still')], excluded: [] }, first);

    expect(report).toEqual({
      created: [imported(0), imported(1), imported(3), imported(4)],
      rejected: [rejected(2, 'still')],
      excluded: [imported(5)],
    });
  });

  it('adds the rows excluded during Fix & Retry to the Excluded Rows', () => {
    const first = { created: [], rejected: [rejected(0, 'a'), rejected(2, 'b')], excluded: [imported(1)] };

    const report = importReport({ created: [imported(0)], rejected: [], excluded: [imported(2)] }, first);

    expect(report.excluded).toEqual([imported(1), imported(2)]);
    expect(report.rejected).toEqual([]);
  });

  it('is the first Commit’s outcome, in file order, when there is no earlier report', () => {
    expect(importReport({ created: [imported(2), imported(0)], rejected: [rejected(1, 'a')], excluded: [] })).toEqual({
      created: [imported(0), imported(2)],
      rejected: [rejected(1, 'a')],
      excluded: [],
    });
  });
});
