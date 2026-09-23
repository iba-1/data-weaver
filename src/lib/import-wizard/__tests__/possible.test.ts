import { describe, it, expect } from 'vitest';
import { findPossibleMatches, isPossibleMatch, matchWords } from '../possible';
import {
  collectRelatedValues,
  relatedValueKey,
  resolutionBlockers,
  resolveValues,
  type LookupResults,
  type MergeTarget,
  type ResolvedValue,
} from '../resolution';
import { planRelatedCreations, substituteRelatedIds } from '../related';
import type { FieldConfig, ImportRow, RelatedCandidate } from '../types';

describe('the words of a value, for Possible Matches', () => {
  it('splits on spaces and punctuation, after the Normalised Match rule', () => {
    expect(matchWords('Fontana, Lucio')).toEqual(['fontana', 'lucio']);
    expect(matchWords('L.Fontana')).toEqual(['l', 'fontana']);
    expect(matchWords('Jean-Paul  SARTRE')).toEqual(['jean', 'paul', 'sartre']);
    expect(matchWords('Niccolò Rossi')).toEqual(['niccolo', 'rossi']);
  });

  it('keeps apostrophes inside a word, so D’Annunzio is not an initial', () => {
    expect(matchWords("D'Annunzio")).toEqual(['dannunzio']);
    expect(matchWords('D’Annunzio')).toEqual(['dannunzio']);
  });

  it('has no words for a value of punctuation only', () => {
    expect(matchWords('-- ?')).toEqual([]);
  });
});

describe('Possible Matches between two values', () => {
  it.each([
    ['word order', 'Fontana, Lucio', 'Lucio Fontana'],
    ['word order without punctuation', 'Rossi Mario', 'Mario Rossi'],
    ['punctuation', 'Jean-Paul Sartre', 'Jean Paul Sartre'],
    ['punctuation only', 'Galleria Rossi & Figli', 'Galleria Rossi Figli'],
    ['an apostrophe of another kind', "Gabriele D'Annunzio", 'Gabriele D’Annunzio'],
    ['an initial', 'L. Fontana', 'Lucio Fontana'],
    ['an initial without a dot', 'L Fontana', 'Lucio Fontana'],
    ['an initial and word order', 'Fontana, L.', 'Lucio Fontana'],
    ['several initials', 'J.-P. Sartre', 'Jean-Paul Sartre'],
    ['a middle initial', 'Lucio M. Fontana', 'Lucio Maria Fontana'],
    ['accents, already folded by the Normalised Match rule', 'Rossi, Niccolo', 'Niccolò Rossi'],
    ['an initial of an accented name', 'É. Manet', 'Édouard Manet'],
  ])('pairs values differing by %s', (_why, a, b) => {
    expect(isPossibleMatch(a, b)).toBe(true);
    expect(isPossibleMatch(b, a)).toBe(true);
  });

  it.each([
    ['share only a surname', 'Anna Rossi', 'Mario Rossi'],
    ['share only a surname, one with an initial that does not fit', 'A. Rossi', 'Mario Rossi'],
    ['are a surname alone and a full name', 'Fontana', 'Lucio Fontana'],
    ['have a different number of words', 'L. Fontana', 'Lucio Maria Fontana'],
    ['differ by a word', 'Galleria Rossi', 'Galleria Bianchi'],
    ['differ by a number', 'Studio 1', 'Studio 2'],
    ['are initials only, with no whole word in common', 'L. F.', 'Lucio Fontana'],
    ['differ by one letter', 'Lucio Fontana', 'Lucia Fontana'],
    ['are a surname with an apostrophe and an initial with a surname', "D'Angelo", 'D. Angelo'],
    ['are a Normalised Match: the same value, not a Possible Match', 'Niccolò  Rossi', 'niccolo rossi'],
    ['are empty or punctuation only', '', '?'],
  ])('does not pair values that %s', (_why, a, b) => {
    expect(isPossibleMatch(a, b)).toBe(false);
    expect(isPossibleMatch(b, a)).toBe(false);
  });

  it('pairs an initial with every full name it fits, but never those names with each other', () => {
    expect(isPossibleMatch('A. Rossi', 'Anna Rossi')).toBe(true);
    expect(isPossibleMatch('A. Rossi', 'Andrea Rossi')).toBe(true);
    expect(isPossibleMatch('Anna Rossi', 'Andrea Rossi')).toBe(false);
  });
});

describe('finding the Possible Matches of a file', () => {
  it('pairs the values of each kind, in file order, never across kinds', () => {
    const values = [
      { kind: 'registry', value: 'lucio fontana' },
      { kind: 'registry', value: 'anna rossi' },
      { kind: 'place', value: 'fontana, lucio' },
      { kind: 'registry', value: 'mario rossi' },
      { kind: 'registry', value: 'fontana, lucio' },
      { kind: 'registry', value: 'l. fontana' },
      { kind: 'registry', value: 'a. rossi' },
    ];
    expect(findPossibleMatches(values)).toEqual([
      { kind: 'registry', values: ['lucio fontana', 'fontana, lucio'] },
      { kind: 'registry', values: ['lucio fontana', 'l. fontana'] },
      { kind: 'registry', values: ['anna rossi', 'a. rossi'] },
      { kind: 'registry', values: ['fontana, lucio', 'l. fontana'] },
    ]);
  });

  it('finds nothing in a file of unrelated names', () => {
    expect(
      findPossibleMatches([
        { kind: 'registry', value: 'anna rossi' },
        { kind: 'registry', value: 'mario rossi' },
        { kind: 'registry', value: 'rossi' },
      ])
    ).toEqual([]);
  });

  it('stays fast on a large file', () => {
    const values = Array.from({ length: 5000 }, (_, i) => ({ kind: 'registry', value: `name${i} rossi` }));
    const started = performance.now();
    expect(findPossibleMatches(values)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

// ============================================================
// MERGING
// ============================================================

type Key = 'title' | 'author' | 'owner';
type Rec = Record<Key, unknown>;

const FIELDS: FieldConfig<Key>[] = [
  { key: 'title', label: 'Title', type: 'string' },
  { key: 'author', label: 'Author', type: 'string', relationship: { kind: 'registry' } },
  { key: 'owner', label: 'Owner', type: 'string', relationship: { kind: 'registry' } },
];

const ROWS = [
  { rowIndex: 0, data: { title: 'Achrome', author: 'Lucio Fontana', owner: 'Galleria Rossi' } },
  { rowIndex: 1, data: { title: 'Concetto', author: 'Fontana, Lucio', owner: 'Galleria  Rossi' } },
  { rowIndex: 2, data: { title: 'Linea', author: 'L. Fontana', owner: 'Rossi, Galleria' } },
  { rowIndex: 3, data: { title: 'Bozza', author: 'Piero Manzoni', owner: 'P. Manzoni' } },
  { rowIndex: 4, data: { title: 'Nero', author: 'Anna Bianchi', owner: null } },
];
const values = collectRelatedValues(ROWS, FIELDS);

const candidate = (id: string, name: string, match: RelatedCandidate['match'], description?: string): RelatedCandidate => ({
  id,
  name,
  match,
  ...(description && { description }),
});

function lookups(entries: Record<string, RelatedCandidate[]>): LookupResults {
  return new Map([['registry', new Map(Object.entries(entries))]]);
}

/** Nothing exists yet, except what a test adds */
function answer(extra: Record<string, RelatedCandidate[]> = {}): LookupResults {
  return lookups({
    'lucio fontana': [],
    'galleria rossi': [],
    'fontana, lucio': [],
    'l. fontana': [],
    'rossi, galleria': [],
    'piero manzoni': [],
    'p. manzoni': [],
    'anna bianchi': [],
    ...extra,
  });
}

const key = (value: string) => relatedValueKey('registry', value);
const byValue = (resolved: ResolvedValue[]) => Object.fromEntries(resolved.map((v) => [v.value, v]));
const merge = (entries: Array<[string, MergeTarget]>) => new Map(entries.map(([value, target]) => [key(value), target]));
const importRows = (): ImportRow<Rec>[] =>
  ROWS.map((row) => ({ importKey: `k${row.rowIndex}`, rowIndex: row.rowIndex, record: row.data as Rec }));

describe('Possible Matches in Resolution', () => {
  it('offers each value the values of the file it might be, merging the less used into the more used', () => {
    const resolved = byValue(resolveValues(values, answer()));

    // Lucio Fontana (1 row) is used as often as the others but seen first: they might merge into it
    expect(resolved['lucio fontana'].possibleMatches).toEqual([]);
    expect(resolved['fontana, lucio'].possibleMatches).toEqual([{ source: 'file', value: 'lucio fontana', name: 'Lucio Fontana' }]);
    expect(resolved['l. fontana'].possibleMatches).toEqual([
      { source: 'file', value: 'lucio fontana', name: 'Lucio Fontana' },
      { source: 'file', value: 'fontana, lucio', name: 'Fontana, Lucio' },
    ]);
    // Galleria Rossi is used in 2 rows, Rossi, Galleria in 1
    expect(resolved['rossi, galleria'].possibleMatches).toEqual([
      { source: 'file', value: 'galleria rossi', name: 'Galleria Rossi' },
    ]);
    expect(resolved['galleria rossi'].possibleMatches).toEqual([]);
    expect(resolved['p. manzoni'].possibleMatches).toEqual([{ source: 'file', value: 'piero manzoni', name: 'Piero Manzoni' }]);
    expect(resolved['anna bianchi'].possibleMatches).toEqual([]);
  });

  it('keeps every value separate by default: each is created, and nothing blocks Commit', () => {
    const resolved = resolveValues(values, answer());
    expect(resolved.every((v) => v.merge === null && v.decision?.action === 'create')).toBe(true);
    expect(resolutionBlockers(resolved)).toEqual({ pending: 0, undecided: 0, unnamed: 0 });
    expect(planRelatedCreations(resolved).map((c) => c.name)).toEqual([
      'Lucio Fontana',
      'Galleria Rossi',
      'Fontana, Lucio',
      'L. Fontana',
      'Rossi, Galleria',
      'Piero Manzoni',
      'P. Manzoni',
      'Anna Bianchi',
    ]);
  });

  it('creates merged values of the file as one record, named by the most frequent spelling across them', () => {
    const resolved = resolveValues(values, answer(), {
      merges: merge([
        ['fontana, lucio', { source: 'file', value: 'lucio fontana' }],
        ['l. fontana', { source: 'file', value: 'fontana, lucio' }],
        ['rossi, galleria', { source: 'file', value: 'galleria rossi' }],
      ]),
    });
    const plan = planRelatedCreations(resolved);
    expect(plan).toEqual([
      {
        kind: 'registry',
        name: 'Lucio Fontana',
        keys: [key('lucio fontana'), key('fontana, lucio'), key('l. fontana')],
      },
      { kind: 'registry', name: 'Galleria Rossi', keys: [key('galleria rossi'), key('rossi, galleria')] },
      { kind: 'registry', name: 'Piero Manzoni', keys: [key('piero manzoni')] },
      { kind: 'registry', name: 'P. Manzoni', keys: [key('p. manzoni')] },
      { kind: 'registry', name: 'Anna Bianchi', keys: [key('anna bianchi')] },
    ]);

    // Every row of the merged values points to the one new record
    const created = plan.map((creation, i) => ({ ...creation, id: `new-${i}` }));
    const { ready } = substituteRelatedIds(importRows(), FIELDS, resolved, created);
    expect(ready.map((row) => [row.record.author, row.record.owner])).toEqual([
      ['new-0', 'new-1'],
      ['new-0', 'new-1'],
      ['new-0', 'new-1'],
      ['new-2', 'new-3'],
      ['new-4', null],
    ]);
  });

  it('names the merged record by the most frequent spelling of all the merged values', () => {
    const rows = [
      { rowIndex: 0, data: { title: 'A', author: 'Fontana, Lucio', owner: 'Fontana, Lucio' } },
      { rowIndex: 1, data: { title: 'B', author: 'Fontana, Lucio', owner: null } },
      { rowIndex: 2, data: { title: 'C', author: 'Lucio Fontana', owner: null } },
      { rowIndex: 3, data: { title: 'D', author: 'lucio fontana', owner: null } },
      { rowIndex: 4, data: { title: 'E', author: 'Lucio Fontana', owner: null } },
    ];
    const fileValues = collectRelatedValues(rows, FIELDS);
    const empty = lookups({ 'fontana, lucio': [], 'lucio fontana': [] });
    // Fontana, Lucio is in 2 rows, Lucio Fontana in 3: Fontana, Lucio merges into it
    const [lucio, fontana] = ['lucio fontana', 'fontana, lucio'].map(
      (value) => byValue(resolveValues(fileValues, empty))[value]
    );
    expect(fontana.possibleMatches).toEqual([{ source: 'file', value: 'lucio fontana', name: 'Lucio Fontana' }]);
    expect(lucio.possibleMatches).toEqual([]);

    const merged = byValue(
      resolveValues(fileValues, empty, { merges: merge([['fontana, lucio', { source: 'file', value: 'lucio fontana' }]]) })
    );
    // "Fontana, Lucio" is written 3 times, "Lucio Fontana" twice (and "lucio fontana" once)
    expect(merged['lucio fontana'].defaultName).toBe('Fontana, Lucio');
    expect(merged['lucio fontana'].decision).toEqual({ action: 'create', name: 'Fontana, Lucio' });
    expect(merged['fontana, lucio'].decision).toEqual({ action: 'create', name: 'Fontana, Lucio' });
  });

  it('uses the name the Importer gave the record the values are merged into', () => {
    const resolved = byValue(
      resolveValues(values, answer(), {
        merges: merge([['p. manzoni', { source: 'file', value: 'piero manzoni' }]]),
        names: new Map([
          [key('piero manzoni'), ' Piero Manzoni (artista) '],
          // A name typed before merging is set aside while merged
          [key('p. manzoni'), 'P. Manzoni'],
        ]),
      })
    );
    expect(resolved['p. manzoni'].decision).toEqual({ action: 'create', name: 'Piero Manzoni (artista)' });
    expect(resolved['p. manzoni'].merge).toEqual({ source: 'file', value: 'piero manzoni' });
  });

  it('links a value merged into a value of the file matched to an existing record, to that record', () => {
    const resolved = byValue(
      resolveValues(values, answer({ 'lucio fontana': [candidate('reg-fontana', 'Lucio Fontana', 'normalised')] }), {
        merges: merge([['l. fontana', { source: 'file', value: 'lucio fontana' }]]),
      })
    );
    expect(resolved['l. fontana'].decision).toEqual({ action: 'link', id: 'reg-fontana', name: 'Lucio Fontana' });
    // Fontana, Lucio might be it too, but stays separate until merged
    expect(resolved['fontana, lucio'].decision).toEqual({ action: 'create', name: 'Fontana, Lucio' });
  });

  it('shows the lookup’s Possible Matches, created by default, and linked to the one chosen when merged', () => {
    const flagged = answer({
      'anna bianchi': [
        candidate('reg-anna', 'Anna Bianchi Rossi', 'possible', '1950'),
        candidate('reg-annabella', 'Annabella Bianchi', 'possible'),
      ],
    });
    const kept = byValue(resolveValues(values, flagged))['anna bianchi'];
    expect(kept).toMatchObject({ group: 'possible', merge: null, decision: { action: 'create', name: 'Anna Bianchi' } });
    expect(kept.possibleMatches).toEqual([
      { source: 'host', candidate: candidate('reg-anna', 'Anna Bianchi Rossi', 'possible', '1950') },
      { source: 'host', candidate: candidate('reg-annabella', 'Annabella Bianchi', 'possible') },
    ]);

    const resolved = resolveValues(values, flagged, {
      merges: merge([['anna bianchi', { source: 'host', id: 'reg-anna' }]]),
    });
    expect(byValue(resolved)['anna bianchi'].decision).toEqual({ action: 'link', id: 'reg-anna', name: 'Anna Bianchi Rossi' });
    expect(planRelatedCreations(resolved).map((c) => c.name)).not.toContain('Anna Bianchi');
    const { ready } = substituteRelatedIds(importRows(), FIELDS, resolved, []);
    expect(ready.find((row) => row.rowIndex === 4)?.record.author).toBe('reg-anna');
  });

  it('links the values merged into a value merged with an existing record', () => {
    const resolved = byValue(
      resolveValues(values, answer({ 'piero manzoni': [candidate('reg-manzoni', 'Piero Manzoni', 'possible')] }), {
        merges: merge([
          ['p. manzoni', { source: 'file', value: 'piero manzoni' }],
          ['piero manzoni', { source: 'host', id: 'reg-manzoni' }],
        ]),
      })
    );
    expect(resolved['p. manzoni'].decision).toEqual({ action: 'link', id: 'reg-manzoni', name: 'Piero Manzoni' });
  });

  it('does not offer a value of the file matched to a record the lookup already flagged for it', () => {
    const resolved = byValue(
      resolveValues(
        values,
        answer({
          'lucio fontana': [candidate('reg-fontana', 'Lucio Fontana', 'normalised')],
          'l. fontana': [candidate('reg-fontana', 'Lucio Fontana', 'possible')],
        })
      )
    );
    expect(resolved['l. fontana'].possibleMatches).toEqual([
      { source: 'host', candidate: candidate('reg-fontana', 'Lucio Fontana', 'possible') },
      { source: 'file', value: 'fontana, lucio', name: 'Fontana, Lucio' },
    ]);
  });

  it('never offers to merge two values that each match an existing record, nor a matched value into another', () => {
    const resolved = byValue(
      resolveValues(
        values,
        answer({
          'lucio fontana': [candidate('reg-1', 'Lucio Fontana', 'normalised')],
          'fontana, lucio': [candidate('reg-2', 'Fontana, Lucio', 'normalised')],
          'l. fontana': [candidate('reg-3', 'Lucio Fontana', 'possible')],
        })
      )
    );
    expect(resolved['lucio fontana'].possibleMatches).toEqual([]);
    expect(resolved['fontana, lucio'].possibleMatches).toEqual([]);
    // The lookup's Possible Matches are only offered for values without a Normalised Match
    expect(resolved['l. fontana'].possibleMatches.map((p) => (p.source === 'file' ? p.value : p.candidate.id))).toEqual([
      'reg-3',
      'lucio fontana',
      'fontana, lucio',
    ]);
  });

  it('follows the decision of a value merged into Homonyms, and waits with it', () => {
    const homonyms = answer({
      'lucio fontana': [candidate('reg-1', 'Lucio Fontana', 'normalised'), candidate('reg-2', 'Lucio Fontana', 'normalised')],
    });
    const merges = merge([['l. fontana', { source: 'file', value: 'lucio fontana' }]]);
    expect(byValue(resolveValues(values, homonyms, { merges }))['l. fontana'].decision).toBeNull();

    const decided = byValue(
      resolveValues(values, homonyms, {
        merges,
        decisions: new Map([[key('lucio fontana'), { action: 'link', id: 'reg-2', name: 'Lucio Fontana' }]]),
      })
    );
    expect(decided['l. fontana'].decision).toEqual({ action: 'link', id: 'reg-2', name: 'Lucio Fontana' });
  });

  it('ignores a merge with something no longer offered, keeping the value separate', () => {
    const resolved = byValue(
      resolveValues(values, answer(), {
        merges: merge([
          ['l. fontana', { source: 'file', value: 'lucio fontana (gone)' }],
          ['p. manzoni', { source: 'host', id: 'reg-gone' }],
          // Merging the more used into the less used is not offered
          ['lucio fontana', { source: 'file', value: 'l. fontana' }],
        ]),
      })
    );
    expect(resolved['l. fontana']).toMatchObject({ merge: null, decision: { action: 'create', name: 'L. Fontana' } });
    expect(resolved['p. manzoni']).toMatchObject({ merge: null, decision: { action: 'create', name: 'P. Manzoni' } });
    expect(resolved['lucio fontana']).toMatchObject({ merge: null, decision: { action: 'create', name: 'Lucio Fontana' } });
  });

  it('offers nothing for a value not looked up yet', () => {
    const resolved = byValue(resolveValues(values, lookups({ 'lucio fontana': [] })));
    expect(resolved['l. fontana']).toMatchObject({ group: 'pending', possibleMatches: [], decision: null });
    expect(resolved['lucio fontana'].possibleMatches).toEqual([]);
  });
});
