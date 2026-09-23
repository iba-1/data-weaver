import { describe, it, expect, vi } from 'vitest';
import {
  collectRelatedValues,
  decisionForRow,
  isValueDecided,
  lookupRelated,
  preferredSpelling,
  relatedValueKey,
  RelatedLookupError,
  relationshipKinds,
  resolutionBlockers,
  resolveValues,
  settleLookup,
  type LookupResults,
  type RelatedDecision,
  type ResolvedValue,
} from '../resolution';
import { createRelatedRecords, planRelatedCreations, substituteRelatedIds } from '../related';
import type { FieldConfig, ImportRow, RelatedCandidate } from '../types';

type Key = 'title' | 'author' | 'owner' | 'lender' | 'venue';
type Rec = Record<Key, unknown>;

const FIELDS: FieldConfig<Key>[] = [
  { key: 'title', label: 'Title', type: 'string' },
  { key: 'author', label: 'Author', type: 'string', relationship: { kind: 'registry' } },
  { key: 'owner', label: 'Owner', type: 'string', relationship: { kind: 'registry' } },
  { key: 'venue', label: 'Venue', type: 'string', relationship: { kind: 'place' } },
  { key: 'lender', label: 'Lender', type: 'string', relationship: { kind: 'registry' } },
];

function row(rowIndex: number, data: Partial<Rec>, excluded = false) {
  return { rowIndex, data: { title: null, author: null, owner: null, lender: null, venue: null, ...data }, excluded };
}

const candidate = (id: string, name: string, match: RelatedCandidate['match'] = 'normalised'): RelatedCandidate => ({
  id,
  name,
  match,
});

function lookups(entries: Record<string, Record<string, RelatedCandidate[]>>): LookupResults {
  return new Map(Object.entries(entries).map(([kind, values]) => [kind, new Map(Object.entries(values))]));
}

describe('Relationship Fields', () => {
  it('groups the fields by the kind of Related Record they point to, in Output Shape order', () => {
    expect(relationshipKinds(FIELDS).map(({ kind, fields }) => [kind, fields.map((f) => f.key)])).toEqual([
      ['registry', ['author', 'owner', 'lender']],
      ['place', ['venue']],
    ]);
    expect(relationshipKinds([{ key: 'title', label: 'Title', type: 'string' }])).toEqual([]);
  });
});

describe('collecting distinct values', () => {
  it('collects each value once per kind across every field of that kind, grouped by Normalised Match', () => {
    const values = collectRelatedValues(
      [
        row(0, { author: 'Lucio Fontana', owner: 'Galleria Rossi', venue: 'Milano' }),
        row(1, { author: 'lucio  fontana', owner: 'Niccolò Rossi', lender: 'Galleria Rossi' }),
        row(2, { author: 'Piero Manzoni', owner: 'Niccolo Rossi', lender: 'niccolò rossi', venue: 'milano ' }),
      ],
      FIELDS
    );

    expect(values.map((v) => [v.kind, v.value, v.rows, v.fields])).toEqual([
      ['registry', 'lucio fontana', [0, 1], ['author']],
      ['registry', 'galleria rossi', [0, 1], ['owner', 'lender']],
      ['registry', 'niccolo rossi', [1, 2], ['owner', 'lender']],
      ['registry', 'piero manzoni', [2], ['author']],
      ['place', 'milano', [0, 2], ['venue']],
    ]);
  });

  it('shows the folded spellings with how often each is used, most frequent first', () => {
    const [niccolo] = collectRelatedValues(
      [
        row(0, { author: 'Niccolò Rossi' }),
        row(1, { author: 'niccolo rossi', owner: 'Niccolò  Rossi' }),
        row(2, { lender: 'niccolo rossi' }),
        row(3, { owner: 'NICCOLÒ ROSSI' }),
      ],
      FIELDS
    );

    // Extra spaces are not a different spelling
    expect(niccolo.spellings).toEqual([
      { text: 'Niccolò Rossi', count: 2 },
      { text: 'niccolo rossi', count: 2 },
      { text: 'NICCOLÒ ROSSI', count: 1 },
    ]);
    // A row using the value in two fields counts once
    expect(niccolo.rows).toEqual([0, 1, 2, 3]);
  });

  it('ignores Excluded Rows and empty cells', () => {
    const values = collectRelatedValues(
      [row(0, { author: 'Lucio Fontana', owner: '  ' }), row(1, { author: 'Piero Manzoni' }, true)],
      FIELDS
    );
    expect(values.map((v) => v.value)).toEqual(['lucio fontana']);
  });

  it('keys values by kind, so the same name of two kinds is two values', () => {
    const values = collectRelatedValues([row(0, { author: 'Roma', venue: 'Roma' })], FIELDS);
    expect(values.map((v) => relatedValueKey(v.kind, v.value))).toEqual([
      relatedValueKey('registry', 'roma'),
      relatedValueKey('place', 'roma'),
    ]);
    expect(new Set(values.map((v) => relatedValueKey(v.kind, v.value))).size).toBe(2);
  });
});

describe('the stored name of a new Related Record', () => {
  it('is the most frequent spelling', () => {
    expect(preferredSpelling([{ text: 'lucio fontana', count: 1 }, { text: 'Lucio Fontana', count: 3 }])).toBe(
      'Lucio Fontana'
    );
  });

  it('prefers the accented spelling over variants that differ only by accents, however frequent', () => {
    expect(preferredSpelling([{ text: 'Niccolo Rossi', count: 5 }, { text: 'Niccolò Rossi', count: 1 }])).toBe(
      'Niccolò Rossi'
    );
  });

  it('counts accent-only variants together against spellings that differ otherwise', () => {
    // "Niccolo Rossi" + "Niccolò Rossi" (4) outweigh "NICCOLO ROSSI" (3); the accented one is chosen
    expect(
      preferredSpelling([
        { text: 'NICCOLO ROSSI', count: 3 },
        { text: 'Niccolo Rossi', count: 3 },
        { text: 'Niccolò Rossi', count: 1 },
      ])
    ).toBe('Niccolò Rossi');
    // Case differs too: the most frequent wins
    expect(preferredSpelling([{ text: 'NICCOLO ROSSI', count: 3 }, { text: 'Niccolò Rossi', count: 1 }])).toBe(
      'NICCOLO ROSSI'
    );
  });

  it('takes the spelling seen first when counts tie', () => {
    expect(preferredSpelling([{ text: 'lucio fontana', count: 2 }, { text: 'Lucio Fontana', count: 2 }])).toBe(
      'lucio fontana'
    );
  });

  it('is the default name of every collected value', () => {
    const [value] = collectRelatedValues(
      [row(0, { author: 'Niccolo Rossi' }), row(1, { author: 'Niccolo Rossi' }), row(2, { owner: 'Niccolò Rossi' })],
      FIELDS
    );
    expect(value.defaultName).toBe('Niccolò Rossi');
  });
});

describe('the Host App lookup answer', () => {
  it('reads one list of candidates per value sent', () => {
    const { candidates, problems } = settleLookup(['lucio fontana', 'piero manzoni'], {
      'lucio fontana': [{ id: 7, name: 'Lucio Fontana', description: '1899–1968', match: 'normalised' }],
      'piero manzoni': [],
    });
    expect(problems).toEqual([]);
    expect(candidates.get('lucio fontana')).toEqual([
      { id: 7, name: 'Lucio Fontana', description: '1899–1968', match: 'normalised' },
    ]);
    expect(candidates.get('piero manzoni')).toEqual([]);
  });

  it('refuses an answer that leaves a value out or has malformed candidates, rather than creating a duplicate', () => {
    expect(settleLookup(['a', 'b'], { a: [] }).problems).toEqual([
      'findRelated gave no candidates list for "b"; answer [] when nothing matches.',
    ]);
    expect(settleLookup(['a'], { a: [{ id: '', name: 'A', match: 'normalised' }] }).problems).toHaveLength(1);
    expect(settleLookup(['a'], { a: [{ id: 1, name: 'A', match: 'maybe' }] }).problems).toHaveLength(1);
    expect(settleLookup(['a'], [[]]).problems).toEqual(['findRelated must resolve with an object keyed by value; it resolved with an array.']);
  });

  it('calls the lookup once, and turns its failures into a RelatedLookupError', async () => {
    const findRelated = vi.fn().mockResolvedValue({ a: [] });
    await expect(lookupRelated('registry', ['a'], findRelated)).resolves.toEqual(new Map([['a', []]]));
    expect(findRelated).toHaveBeenCalledTimes(1);
    expect(findRelated).toHaveBeenCalledWith('registry', ['a']);

    const failed = await lookupRelated('registry', ['a'], () => Promise.reject(new Error('503'))).catch((e) => e);
    expect(failed).toBeInstanceOf(RelatedLookupError);
    expect(failed).toMatchObject({ kind: 'registry', hostMessage: '503', problems: [] });

    const invalid = await lookupRelated('registry', ['a'], () => Promise.resolve({})).catch((e) => e);
    expect(invalid).toMatchObject({ kind: 'registry', hostMessage: undefined, problems: [expect.any(String)] });
  });
});

describe('resolving values', () => {
  const values = collectRelatedValues(
    [
      row(0, { author: 'Lucio Fontana', owner: 'Anna Bianchi', lender: 'Piero Manzoni' }),
      row(1, { author: 'L. Fontana', owner: 'Niccolo Rossi' }),
    ],
    FIELDS
  );
  const answer = lookups({
    registry: {
      'lucio fontana': [candidate('r1', 'Lucio Fontana'), candidate('r9', 'Lucia Fontana', 'possible')],
      'anna bianchi': [candidate('r2', 'Anna Bianchi'), candidate('r3', 'Anna Bianchi')],
      'piero manzoni': [],
      'l. fontana': [candidate('r1', 'Lucio Fontana', 'possible')],
    },
  });
  const byValue = (resolved: ReturnType<typeof resolveValues>) => Object.fromEntries(resolved.map((v) => [v.value, v]));

  it('links a value with exactly one Normalised Match, creates one with none or only Possible Matches, and decides nothing else', () => {
    const resolved = byValue(resolveValues(values, answer));

    expect(resolved['lucio fontana']).toMatchObject({ group: 'matched', decision: { action: 'link', id: 'r1', name: 'Lucio Fontana' } });
    expect(resolved['piero manzoni']).toMatchObject({ group: 'create', decision: { action: 'create', name: 'Piero Manzoni' } });
    // Homonyms wait for the Importer
    expect(resolved['anna bianchi']).toMatchObject({ group: 'homonyms', decision: null });
    // Possible Matches are kept separate unless the Importer merges them
    expect(resolved['l. fontana']).toMatchObject({ group: 'possible', decision: { action: 'create', name: 'L. Fontana' } });
    // Not looked up yet
    expect(resolved['niccolo rossi']).toMatchObject({ group: 'pending', decision: null, candidates: [] });
  });

  it('uses the name the Importer gave a new record, trimmed', () => {
    const resolved = byValue(
      resolveValues(values, answer, { names: new Map([[relatedValueKey('registry', 'piero manzoni'), '  Piero Manzoni (artist) ']]) })
    );
    expect(resolved['piero manzoni'].decision).toEqual({ action: 'create', name: 'Piero Manzoni (artist)' });
  });

  it('lets an Importer’s decision override the automatic one (for Homonyms and Possible Matches)', () => {
    const resolved = byValue(
      resolveValues(values, answer, {
        decisions: new Map([[relatedValueKey('registry', 'anna bianchi'), { action: 'link', id: 'r3', name: 'Anna Bianchi' }]]),
      })
    );
    expect(resolved['anna bianchi']).toMatchObject({ group: 'homonyms', decision: { action: 'link', id: 'r3' } });
  });

  it('counts what still blocks Commit', () => {
    const resolved = resolveValues(values, answer, { names: new Map([[relatedValueKey('registry', 'piero manzoni'), ' ']]) });
    expect(resolutionBlockers(resolved)).toEqual({ pending: 1, undecided: 1, unnamed: 1 });
    const ready = resolveValues(
      values.filter((v) => ['lucio fontana', 'piero manzoni'].includes(v.value)),
      answer
    );
    expect(resolutionBlockers(ready)).toEqual({ pending: 0, undecided: 0, unnamed: 0 });
  });
});

describe('Homonyms: a decision per value, with per-row overrides', () => {
  // Four rows by "Mario Rossi": the Registry holds two, b. 1950 and b. 1987
  const file = [
    row(0, { title: 'Achrome', author: 'Mario Rossi' }),
    row(1, { title: 'Linea', author: 'mario rossi', owner: 'Mario Rossi' }),
    row(2, { title: 'Bozza', author: 'Mario Rossi' }),
    row(3, { title: 'Senza titolo', author: 'Mario  Rossi' }),
  ];
  const key = relatedValueKey('registry', 'mario rossi');
  const answer = lookups({
    registry: {
      'mario rossi': [
        { id: 'r-1950', name: 'Mario Rossi', description: 'b. 1950', match: 'normalised' },
        { id: 'r-1987', name: 'Mario Rossi', description: 'b. 1987', match: 'normalised' },
      ],
    },
  });
  const values = collectRelatedValues(file, FIELDS);
  const link1950 = { action: 'link', id: 'r-1950', name: 'Mario Rossi' } as const;
  const link1987 = { action: 'link', id: 'r-1987', name: 'Mario Rossi' } as const;
  const createNew = (name = 'Mario Rossi') => ({ action: 'create', name }) as const;
  const importRows: ImportRow<Rec>[] = file.map((r) => ({ importKey: `key-${r.rowIndex}`, rowIndex: r.rowIndex, record: r.data }));

  function resolve(
    decision: RelatedDecision | undefined,
    overrides: Array<[number, RelatedDecision]> = []
  ): ResolvedValue[] {
    return resolveValues(values, answer, {
      decisions: decision ? new Map([[key, decision]]) : undefined,
      rowDecisions: new Map([[key, new Map(overrides)]]),
    });
  }

  it('keeps each row’s override, trimmed, only for rows using the value, and falls back to the value’s decision', () => {
    const [mario] = resolve(link1950, [
      [1, link1987],
      [2, createNew('  Mario Rossi ')],
      // Row 9 does not use the value (e.g. it was edited or excluded): its override is ignored
      [9, link1987],
    ]);

    expect(mario.group).toBe('homonyms');
    expect(mario.decision).toEqual(link1950);
    expect([...mario.rowDecisions]).toEqual([
      [1, link1987],
      [2, createNew('Mario Rossi')],
    ]);
    expect([0, 1, 2, 3].map((r) => decisionForRow(mario, r))).toEqual([link1950, link1987, createNew(), link1950]);
  });

  it('blocks Commit until every row of a Homonym has a decision, and while a new record has no name', () => {
    expect(resolutionBlockers(resolve(undefined))).toEqual({ pending: 0, undecided: 1, unnamed: 0 });
    // Some rows chosen individually, the rest not
    expect(resolutionBlockers(resolve(undefined, [[0, link1950], [1, link1987]]))).toEqual({
      pending: 0,
      undecided: 1,
      unnamed: 0,
    });
    // Every row chosen individually: decided, with no value-level choice
    const everyRow = resolve(undefined, [0, 1, 2, 3].map((r) => [r, link1987]));
    expect(everyRow[0].decision).toBeNull();
    expect(isValueDecided(everyRow[0])).toBe(true);
    expect(resolutionBlockers(everyRow)).toEqual({ pending: 0, undecided: 0, unnamed: 0 });
    // A value-level choice covers the rows without an override
    expect(resolutionBlockers(resolve(link1950, [[2, link1987]]))).toEqual({ pending: 0, undecided: 0, unnamed: 0 });
    // A row creating a new record needs its name
    expect(resolutionBlockers(resolve(link1950, [[2, createNew(' ')]]))).toEqual({ pending: 0, undecided: 0, unnamed: 1 });
    // A value-level "create" overridden on every row creates nothing, so its empty name does not block
    expect(resolutionBlockers(resolve(createNew(''), [0, 1, 2, 3].map((r) => [r, link1950])))).toEqual({
      pending: 0,
      undecided: 0,
      unnamed: 0,
    });
  });

  it('creates one new record per value for all its rows assigned to "create new", and none when no row is', () => {
    expect(planRelatedCreations(resolve(link1950, [[1, createNew()], [3, createNew()]]))).toEqual([
      { kind: 'registry', name: 'Mario Rossi', keys: [key] },
    ]);
    expect(planRelatedCreations(resolve(createNew(), [[2, link1987]]))).toEqual([
      { kind: 'registry', name: 'Mario Rossi', keys: [key] },
    ]);
    expect(planRelatedCreations(resolve(createNew(), [0, 1, 2, 3].map((r) => [r, link1950])))).toEqual([]);
    expect(planRelatedCreations(resolve(link1987))).toEqual([]);
  });

  it('gives each row the ID of its own choice', () => {
    const resolved = resolve(link1950, [
      [1, link1987],
      [3, createNew()],
    ]);
    const created = planRelatedCreations(resolved).map((c) => ({ ...c, id: 'r-new' }));
    const { ready, rejected } = substituteRelatedIds(importRows, FIELDS, resolved, created);

    expect(rejected).toEqual([]);
    expect(ready.map((r) => [r.record.title, r.record.author, r.record.owner])).toEqual([
      ['Achrome', 'r-1950', null],
      // The override covers every field of the row using the value
      ['Linea', 'r-1987', 'r-1987'],
      ['Bozza', 'r-1950', null],
      ['Senza titolo', 'r-new', null],
    ]);
  });

  it('rejects only the rows assigned to a new record that could not be created', () => {
    const resolved = resolve(link1950, [[3, createNew()]]);
    const created = planRelatedCreations(resolved).map((c) => ({ ...c, reason: 'Registry is read-only' }));
    const { ready, rejected } = substituteRelatedIds(importRows, FIELDS, resolved, created);

    expect(ready.map((r) => r.rowIndex)).toEqual([0, 1, 2]);
    expect(rejected.map((r) => [r.rowIndex, r.reason])).toEqual([
      [3, 'The record "Mario Rossi" could not be created: Registry is read-only'],
    ]);
  });

  it('refuses to substitute a row with no decision', () => {
    const resolved = resolve(undefined, [[0, link1950]]);
    expect(() => substituteRelatedIds(importRows, FIELDS, resolved, [])).toThrow(/row 2 was not resolved/);
  });
});

describe('planning and creating new Related Records', () => {
  function resolvedFile(rows: ReturnType<typeof row>[], answers: LookupResults, names?: Map<string, string>) {
    return resolveValues(collectRelatedValues(rows, FIELDS), answers, { names });
  }

  it('plans each new record once, even when its value is used in several fields', () => {
    const resolved = resolvedFile(
      [row(0, { owner: 'Galleria Rossi', lender: 'galleria rossi' }), row(1, { author: 'Lucio Fontana', lender: 'Galleria Rossi' })],
      lookups({ registry: { 'galleria rossi': [], 'lucio fontana': [candidate('r1', 'Lucio Fontana')] } })
    );
    expect(planRelatedCreations(resolved)).toEqual([
      { kind: 'registry', name: 'Galleria Rossi', keys: [relatedValueKey('registry', 'galleria rossi')] },
    ]);
  });

  it('creates once two values whose stored names the Importer made the same', () => {
    const names = new Map([[relatedValueKey('registry', 'g. rossi'), 'Galleria Rossi']]);
    const resolved = resolvedFile(
      [row(0, { owner: 'Galleria Rossi', lender: 'G. Rossi' })],
      lookups({ registry: { 'galleria rossi': [], 'g. rossi': [] } }),
      names
    );
    expect(planRelatedCreations(resolved)).toEqual([
      {
        kind: 'registry',
        name: 'Galleria Rossi',
        keys: [relatedValueKey('registry', 'galleria rossi'), relatedValueKey('registry', 'g. rossi')],
      },
    ]);
  });

  it('keeps kinds apart: the same name of two kinds is two records', () => {
    const resolved = resolvedFile(
      [row(0, { author: 'Roma', venue: 'Roma' })],
      lookups({ registry: { roma: [] }, place: { roma: [] } })
    );
    expect(planRelatedCreations(resolved).map((c) => [c.kind, c.name])).toEqual([
      ['registry', 'Roma'],
      ['place', 'Roma'],
    ]);
  });

  it('creates records one at a time, in order, and records each ID or failure', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const createRelated = vi.fn(async (kind: string, name: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      if (name === 'Broken') throw new Error('Name not allowed');
      if (name === 'Nothing') return undefined as unknown as string;
      return `${kind}:${name}`;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const created = await createRelatedRecords(
      [
        { kind: 'registry', name: 'Anna', keys: ['k1'] },
        { kind: 'registry', name: 'Broken', keys: ['k2'] },
        { kind: 'place', name: 'Nothing', keys: ['k3'] },
      ],
      { createRelated }
    );

    expect(createRelated.mock.calls).toEqual([
      ['registry', 'Anna'],
      ['registry', 'Broken'],
      ['place', 'Nothing'],
    ]);
    expect(maxInFlight).toBe(1);
    expect(created).toEqual([
      { kind: 'registry', name: 'Anna', keys: ['k1'], id: 'registry:Anna' },
      { kind: 'registry', name: 'Broken', keys: ['k2'], reason: 'Name not allowed' },
      { kind: 'place', name: 'Nothing', keys: ['k3'], reason: 'No ID was received for the new record.' },
    ]);
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('stops creating once aborted', async () => {
    const abort = new AbortController();
    const createRelated = vi.fn(async (_kind: string, name: string) => {
      abort.abort();
      return name;
    });
    const created = await createRelatedRecords(
      [
        { kind: 'registry', name: 'Anna', keys: ['k1'] },
        { kind: 'registry', name: 'Bruno', keys: ['k2'] },
      ],
      { createRelated, signal: abort.signal }
    );
    expect(createRelated).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
  });
});

describe('substituting Related Record IDs into rows', () => {
  const file = [
    row(0, { title: 'Achrome', author: 'Piero Manzoni', owner: 'Galleria Rossi', lender: 'galleria rossi' }),
    row(1, { title: 'Concetto', author: 'Lucio Fontana', venue: 'Milano' }),
    row(2, { title: 'Senza titolo', author: 'lucio fontana', owner: null }),
  ];
  const resolved = resolveValues(
    collectRelatedValues(file, FIELDS),
    lookups({
      registry: { 'piero manzoni': [], 'galleria rossi': [], 'lucio fontana': [candidate('r1', 'Lucio Fontana')] },
      place: { milano: [candidate(42 as unknown as string, 'Milano')] },
    })
  );
  const importRows: ImportRow<Rec>[] = file.map((r) => ({ importKey: `key-${r.rowIndex}`, rowIndex: r.rowIndex, record: r.data }));

  it('replaces every Relationship Field value with its Related Record’s ID, never a name', () => {
    const created = planRelatedCreations(resolved).map((c) => ({ ...c, id: `new:${c.name}` }));
    const { ready, rejected } = substituteRelatedIds(importRows, FIELDS, resolved, created);

    expect(rejected).toEqual([]);
    expect(ready.map((r) => r.record)).toEqual([
      { title: 'Achrome', author: 'new:Piero Manzoni', owner: 'new:Galleria Rossi', lender: 'new:Galleria Rossi', venue: null },
      { title: 'Concetto', author: 'r1', owner: null, lender: null, venue: 42 },
      { title: 'Senza titolo', author: 'r1', owner: null, lender: null, venue: null },
    ]);
    expect(ready.map((r) => r.importKey)).toEqual(['key-0', 'key-1', 'key-2']);
    // The reviewed rows are not changed
    expect(importRows[0].record.author).toBe('Piero Manzoni');
  });

  it('rejects the rows pointing to a record that could not be created, naming it, and keeps their names', () => {
    const created = planRelatedCreations(resolved).map((c) =>
      c.name === 'Galleria Rossi' ? { ...c, reason: 'Registry is read-only' } : { ...c, id: `new:${c.name}` }
    );
    const { ready, rejected } = substituteRelatedIds(importRows, FIELDS, resolved, created);

    expect(ready.map((r) => r.rowIndex)).toEqual([1, 2]);
    expect(rejected).toEqual([
      {
        ...importRows[0],
        reason: 'The record "Galleria Rossi" could not be created: Registry is read-only',
        field: 'owner',
        cause: 'relatedNotCreated',
      },
    ]);
  });
});
