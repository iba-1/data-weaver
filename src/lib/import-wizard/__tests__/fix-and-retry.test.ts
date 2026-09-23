import { describe, it, expect } from 'vitest';
import {
  collectRelatedValues,
  decisionForRow,
  relatedValueKey,
  resolveValues,
  type LookupResults,
  type RelatedDecision,
} from '../resolution';
import {
  createdRelatedIds,
  linkAlreadyCreated,
  planRelatedCreations,
  rememberCommitted,
  retryDecisions,
  undecidedValuesOnly,
} from '../related';
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
    // Galleria Nuova was committed (in row 0), linked to the record created for it
    const decided = rememberCommitted(
      new Map(),
      resolveValues(collectRelatedValues([row(0, { author: 'Galleria Nuova' })], FIELDS), nothingFound('galleria nuova'))
    );
    const rows = [row(3, { title: 'Achrome', author: 'galleria  Nuova', lender: 'Piero Manzoni' })];

    const undecided = undecidedValuesOnly(rows, FIELDS, decided);

    expect(undecided).toEqual([{ rowIndex: 3, data: { title: 'Achrome', author: '', lender: 'Piero Manzoni' } }]);
    expect(rows[0].data.author).toBe('galleria  Nuova');
    expect(collectRelatedValues(undecided, FIELDS).map((v) => v.value)).toEqual(['piero manzoni']);
  });
});

describe('Fix & Retry with Homonyms and merges', () => {
  // Mario Rossi is a Homonym, decided for individual rows only: row 0 is b. 1950, row 1 b. 1987, row 2 a new record
  const HOMONYMS: LookupResults = new Map([
    [
      'registry',
      new Map([
        [
          'mario rossi',
          [
            { id: 'rossi-1950', name: 'Mario Rossi', description: 'b. 1950', match: 'normalised' as const },
            { id: 'rossi-1987', name: 'Mario Rossi', description: 'b. 1987', match: 'normalised' as const },
          ],
        ],
        ['piero manzoni', []],
        ['manzoni, piero', []],
      ]),
    ],
  ]);
  const rossi = relatedValueKey('registry', 'mario rossi');
  const firstRows = [
    row(0, { title: 'Achrome', author: 'Mario Rossi' }),
    row(1, { title: 'Linea', author: 'Mario Rossi' }),
    row(2, { title: 'Bozza', author: 'mario rossi' }),
    row(3, { title: 'Nero', author: 'Piero Manzoni' }),
    row(4, { title: 'Bianco', author: 'Manzoni, Piero' }),
  ];
  const firstResolved = resolveValues(collectRelatedValues(firstRows, FIELDS), HOMONYMS, {
    rowDecisions: new Map([
      [
        rossi,
        new Map<number, RelatedDecision>([
          [0, { action: 'link', id: 'rossi-1950', name: 'Mario Rossi' }],
          [1, { action: 'link', id: 'rossi-1987', name: 'Mario Rossi' }],
          [2, { action: 'create', name: 'Mario Rossi' }],
        ]),
      ],
    ]),
    // "Manzoni, Piero" is merged with "Piero Manzoni": one new record for both
    merges: new Map([[relatedValueKey('registry', 'manzoni, piero'), { source: 'file' as const, value: 'piero manzoni' }]]),
  });
  const createdIds = createdRelatedIds([
    { kind: 'registry', name: 'Mario Rossi', keys: [rossi], id: 'reg-new-rossi' },
    { kind: 'registry', name: 'Piero Manzoni', keys: [], id: 'reg-manzoni' },
  ]);
  const committed = rememberCommitted(new Map(), linkAlreadyCreated(firstResolved, createdIds));
  const decisionOf = (resolved: ReturnType<typeof retryDecisions>, rowIndex: number) =>
    decisionForRow(resolved!.find((value) => value.rows.includes(rowIndex))!, rowIndex);

  it('links the rows decided "create new" whose record was created, not only the value', () => {
    const [value] = linkAlreadyCreated(firstResolved, createdIds);
    expect(value.decision).toBeNull();
    expect([...value.rowDecisions]).toEqual([
      [0, { action: 'link', id: 'rossi-1950', name: 'Mario Rossi' }],
      [1, { action: 'link', id: 'rossi-1987', name: 'Mario Rossi' }],
      [2, { action: 'link', id: 'reg-new-rossi', name: 'Mario Rossi' }],
    ]);
  });

  it('gives each row sent again the decision it was committed with, and creates nothing again', () => {
    const resolved = retryDecisions([firstRows[1], firstRows[2], firstRows[4]], FIELDS, committed, []);

    expect(decisionOf(resolved, 1)).toEqual({ action: 'link', id: 'rossi-1987', name: 'Mario Rossi' });
    expect(decisionOf(resolved, 2)).toEqual({ action: 'link', id: 'reg-new-rossi', name: 'Mario Rossi' });
    // The merged value keeps the record created for both values
    expect(decisionOf(resolved, 4)).toEqual({ action: 'link', id: 'reg-manzoni', name: 'Piero Manzoni' });
    // Each value covers only the rows sent again
    expect(resolved!.map((value) => value.rows)).toEqual([[1, 2], [4]]);
    expect(planRelatedCreations(resolved!)).toEqual([]);
  });

  it('tries again, once, to create the record of merged values that could not be created', () => {
    const failed = rememberCommitted(new Map(), linkAlreadyCreated(firstResolved, new Map()));

    const resolved = retryDecisions([firstRows[3], firstRows[4]], FIELDS, failed, []);

    expect(planRelatedCreations(resolved!)).toEqual([
      {
        kind: 'registry',
        name: 'Piero Manzoni',
        keys: [relatedValueKey('registry', 'piero manzoni'), relatedValueKey('registry', 'manzoni, piero')],
      },
    ]);
  });

  it('sends to Resolution only the rows a value has no decision for', () => {
    // Row 7 now uses Mario Rossi, which was decided for individual rows only
    const rows = [row(1, { author: 'Mario Rossi' }), row(7, { author: 'mario  rossi' })];

    expect(undecidedValuesOnly(rows, FIELDS, committed).map((r) => r.data.author)).toEqual(['', 'mario  rossi']);
    expect(retryDecisions(rows, FIELDS, committed, [])).toBeNull();
  });

  it('adds the decisions made in Resolution since, for the rows without one, and remembers them all', () => {
    const rows = [row(1, { author: 'Mario Rossi' }), row(7, { author: 'mario  rossi' })];
    // Resolution saw only row 7, and the Importer chose b. 1950 for the value
    const fresh = resolveValues(collectRelatedValues(undecidedValuesOnly(rows, FIELDS, committed), FIELDS), HOMONYMS, {
      decisions: new Map([[rossi, { action: 'link', id: 'rossi-1950', name: 'Mario Rossi' }]]),
    });

    const resolved = retryDecisions(rows, FIELDS, committed, fresh);

    expect(resolved!.map((value) => value.rows)).toEqual([[1, 7]]);
    expect(decisionOf(resolved, 1)).toEqual({ action: 'link', id: 'rossi-1987', name: 'Mario Rossi' });
    expect(decisionOf(resolved, 7)).toEqual({ action: 'link', id: 'rossi-1950', name: 'Mario Rossi' });

    // After the retry, the first Commit's row decisions are still remembered alongside the new ones
    const after = rememberCommitted(committed, resolved!).get(rossi)!;
    expect([0, 1, 2, 7].map((rowIndex) => decisionForRow(after, rowIndex))).toEqual([
      { action: 'link', id: 'rossi-1950', name: 'Mario Rossi' },
      { action: 'link', id: 'rossi-1987', name: 'Mario Rossi' },
      { action: 'link', id: 'reg-new-rossi', name: 'Mario Rossi' },
      { action: 'link', id: 'rossi-1950', name: 'Mario Rossi' },
    ]);
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
