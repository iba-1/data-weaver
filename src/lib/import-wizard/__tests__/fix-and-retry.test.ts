import { describe, it, expect } from 'vitest';
import {
  collectRelatedValues,
  decisionForRow,
  relatedValueKey,
  resolveValues,
  type LookupResults,
  type MergeTarget,
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

describe('Possible Matches with the names committed earlier', () => {
  // The first Commit: Anna Bianchi was created (reg-anna), Piero Manzoni could not be created,
  // and Mario Rossi (Homonyms) went to b. 1950 except in row 3, which went to b. 1987
  const firstRows = [
    row(0, { author: 'Anna Bianchi' }),
    row(1, { author: 'Piero Manzoni' }),
    row(2, { author: 'Mario Rossi' }),
    row(3, { author: 'Mario Rossi' }),
    row(4, { author: 'Lucio Fontana' }),
  ];
  const firstLookups: LookupResults = new Map([
    [
      'registry',
      new Map([
        ['anna bianchi', []],
        ['piero manzoni', []],
        [
          'mario rossi',
          [
            { id: 'rossi-1950', name: 'Mario Rossi', match: 'normalised' as const },
            { id: 'rossi-1987', name: 'Mario Rossi', match: 'normalised' as const },
          ],
        ],
        ['lucio fontana', [{ id: 'reg-fontana', name: 'Lucio Fontana', match: 'normalised' as const }]],
      ]),
    ],
  ]);
  const rossi = relatedValueKey('registry', 'mario rossi');
  const firstResolved = resolveValues(collectRelatedValues(firstRows, FIELDS), firstLookups, {
    decisions: new Map([[rossi, { action: 'link', id: 'rossi-1950', name: 'Mario Rossi' }]]),
    rowDecisions: new Map([[rossi, new Map<number, RelatedDecision>([[3, { action: 'link', id: 'rossi-1987', name: 'Mario Rossi' }]])]]),
  });
  const createdIds = createdRelatedIds([
    { kind: 'registry', name: 'Anna Bianchi', keys: [], id: 'reg-anna' },
    { kind: 'registry', name: 'Piero Manzoni', keys: [], reason: 'Registry unavailable' },
  ]);
  const committed = rememberCommitted(new Map(), linkAlreadyCreated(firstResolved, createdIds));
  const earlier = [...committed.values()];

  // Fix & Retry: names typed for the first time
  const retryRows = [
    row(5, { author: 'A. Bianchi' }),
    row(6, { author: 'Manzoni, Piero' }),
    row(7, { author: 'M. Rossi', lender: 'Fontana, Lucio' }),
    row(8, { author: 'Bianchi, A.' }),
    row(9, { author: 'A. Bianchi' }),
  ];
  const freshValues = collectRelatedValues(retryRows, FIELDS);
  const freshLookups: LookupResults = new Map([
    [
      'registry',
      new Map([
        ['a. bianchi', []],
        ['manzoni, piero', []],
        ['m. rossi', []],
        // The lookup already flags Lucio Fontana's record for Fontana, Lucio
        ['fontana, lucio', [{ id: 'reg-fontana', name: 'Lucio Fontana', match: 'possible' as const }]],
        ['bianchi, a.', []],
      ]),
    ],
  ]);
  const committedMatch = (value: string, name: string) => ({ source: 'committed' as const, value, name });
  const byValue = (resolved: ReturnType<typeof resolveValues>) => Object.fromEntries(resolved.map((v) => [v.value, v]));
  const toCommitted = (value: string) => ({ source: 'committed' as const, value });

  it('offers a name new in Fix & Retry the names committed earlier it might be, keeping it separate by default', () => {
    const resolved = byValue(resolveValues(freshValues, freshLookups, { committed: earlier }));

    expect(resolved['a. bianchi'].possibleMatches).toEqual([committedMatch('anna bianchi', 'Anna Bianchi')]);
    expect(resolved['a. bianchi']).toMatchObject({ merge: null, decision: { action: 'create', name: 'A. Bianchi' } });
    // Also a name whose record could not be created
    expect(resolved['manzoni, piero'].possibleMatches).toEqual([committedMatch('piero manzoni', 'Piero Manzoni')]);
    expect(resolved['manzoni, piero'].decision).toEqual({ action: 'create', name: 'Manzoni, Piero' });
    // After the lookup's and the file's own Possible Matches
    expect(resolved['bianchi, a.'].possibleMatches).toEqual([
      { source: 'file', value: 'a. bianchi', name: 'A. Bianchi' },
      committedMatch('anna bianchi', 'Anna Bianchi'),
    ]);
    // The committed values are offered, never decided again
    expect(Object.keys(resolved)).toEqual(['a. bianchi', 'manzoni, piero', 'm. rossi', 'fontana, lucio', 'bianchi, a.']);
  });

  it('offers a committed name only one way, and only when its rows all point to one record not already offered', () => {
    const resolved = byValue(resolveValues(freshValues, freshLookups, { committed: earlier }));

    // Mario Rossi was committed to two different records: merging with it would be ambiguous
    expect(resolved['m. rossi'].possibleMatches).toEqual([]);
    // Lucio Fontana was linked to the record the lookup already offers
    expect(resolved['fontana, lucio'].possibleMatches).toEqual([
      { source: 'host', candidate: { id: 'reg-fontana', name: 'Lucio Fontana', match: 'possible' } },
    ]);
    // A merge with a committed value not offered is ignored
    const ignored = byValue(
      resolveValues(freshValues, freshLookups, {
        committed: earlier,
        merges: new Map([[relatedValueKey('registry', 'm. rossi'), toCommitted('anna bianchi')]]),
      })
    );
    expect(ignored['m. rossi']).toMatchObject({ merge: null, decision: { action: 'create', name: 'M. Rossi' } });
  });

  it('links a name merged with a committed name to the record it was committed with, creating nothing', () => {
    const fresh = resolveValues(freshValues, freshLookups, {
      committed: earlier,
      merges: new Map<string, MergeTarget>([
        [relatedValueKey('registry', 'a. bianchi'), toCommitted('anna bianchi')],
        // Merged into A. Bianchi, so it follows it to Anna Bianchi's record
        [relatedValueKey('registry', 'bianchi, a.'), { source: 'file' as const, value: 'a. bianchi' }],
      ]),
    });
    expect(byValue(fresh)['a. bianchi'].decision).toEqual({ action: 'link', id: 'reg-anna', name: 'Anna Bianchi' });
    expect(byValue(fresh)['bianchi, a.'].decision).toEqual({ action: 'link', id: 'reg-anna', name: 'Anna Bianchi' });

    const resolved = retryDecisions([retryRows[0], retryRows[3], retryRows[4]], FIELDS, committed, fresh);
    expect(planRelatedCreations(resolved!)).toEqual([]);
  });

  it('makes a name merged with a committed name whose record could not be created share its one creation', () => {
    const fresh = resolveValues(freshValues, freshLookups, {
      committed: earlier,
      merges: new Map([[relatedValueKey('registry', 'manzoni, piero'), toCommitted('piero manzoni')]]),
    });
    expect(byValue(fresh)['manzoni, piero'].decision).toEqual({ action: 'create', name: 'Piero Manzoni' });

    // Row 1 (Piero Manzoni, not created) is sent again with row 6
    const resolved = retryDecisions([firstRows[1], retryRows[1]], FIELDS, committed, fresh);
    expect(planRelatedCreations(resolved!)).toEqual([
      {
        kind: 'registry',
        name: 'Piero Manzoni',
        keys: [relatedValueKey('registry', 'piero manzoni'), relatedValueKey('registry', 'manzoni, piero')],
      },
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
