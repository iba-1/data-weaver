/**
 * Resolution: before Commit, every distinct Relationship Field value in the
 * file is matched once to an existing Related Record or marked to be created
 * (ADR-0001). This module collects the values, reads the Host App's lookup
 * and decides what can be decided without the Importer. Nothing here creates
 * anything: creating happens at the start of Commit (`related.ts`).
 */

import type { FieldConfig, FindRelated, RelatedCandidate, RelatedRecordId } from './types';
import { normaliseForMatch } from './normalise';
import { findPossibleMatches, type PossiblePair } from './possible';
import { cellText } from './values';

/** The Relationship Fields of one kind of Related Record, in Output Shape order */
export interface RelationshipKind<F extends Pick<FieldConfig, 'key' | 'relationship'> = FieldConfig> {
  kind: string;
  fields: F[];
}

/** The Output Shape's Relationship Fields grouped by kind, kinds in order of their first field */
export function relationshipKinds<F extends Pick<FieldConfig, 'key' | 'relationship'>>(
  fields: F[]
): RelationshipKind<F>[] {
  const kinds = new Map<string, F[]>();
  for (const field of fields) {
    const kind = field.relationship?.kind;
    if (kind === undefined) continue;
    const list = kinds.get(kind) ?? [];
    list.push(field);
    kinds.set(kind, list);
  }
  return [...kinds].map(([kind, list]) => ({ kind, fields: list }));
}

/** Whether the Output Shape has Relationship Fields, so the wizard has a Resolution step */
export function hasRelationshipFields(fields: Pick<FieldConfig, 'relationship'>[]): boolean {
  return fields.some((field) => field.relationship !== undefined);
}

/** One way a value is written in the file, and how many cells write it so */
export interface Spelling {
  /** The cell's text, trimmed, with runs of whitespace collapsed to one space */
  text: string;
  count: number;
}

/** A distinct value of one kind's Relationship Fields across the whole file */
export interface RelatedValue {
  kind: string;
  /** Its Normalised Match form: what the lookup receives, and its identity within the kind */
  value: string;
  /** The spellings folded into it, most frequent first (ties: first seen first) */
  spellings: Spelling[];
  /** The rows using it, by `rowIndex`, in file order */
  rows: number[];
  /** The keys of the fields it appears in, in Output Shape order */
  fields: string[];
  /** The stored name for a new Related Record: see `preferredSpelling` */
  defaultName: string;
}

/** Identifies a value across kinds: the same name of two kinds is two values */
export function relatedValueKey(kind: string, value: string): string {
  return `${kind}\u0000${value}`;
}

const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

/** A value's Normalised Match form, or '' for an empty cell */
export function relatedValueOf(cell: unknown): string {
  return normaliseForMatch(cellText(cell));
}

interface RowLike {
  rowIndex: number;
  data: unknown;
  excluded?: boolean;
}

/**
 * Collect the distinct values of every Relationship Field, per kind, grouped
 * by Normalised Match. Excluded Rows and empty cells are ignored. Values come
 * in kind order, then in order of first appearance (rows in file order,
 * fields in Output Shape order).
 */
export function collectRelatedValues(
  rows: RowLike[],
  fields: Pick<FieldConfig, 'key' | 'relationship'>[]
): RelatedValue[] {
  const kinds = relationshipKinds(fields);
  const byKind = new Map<string, Map<string, { spellings: Map<string, number>; rows: Set<number>; fields: Set<string> }>>(
    kinds.map(({ kind }) => [kind, new Map()])
  );

  for (const row of rows) {
    if (row.excluded) continue;
    const data = row.data as Record<string, unknown>;
    for (const { kind, fields: kindFields } of kinds) {
      const values = byKind.get(kind)!;
      for (const field of kindFields) {
        const text = tidy(cellText(data[field.key]));
        const value = normaliseForMatch(text);
        if (value === '') continue;
        let entry = values.get(value);
        if (!entry) {
          entry = { spellings: new Map(), rows: new Set(), fields: new Set() };
          values.set(value, entry);
        }
        entry.spellings.set(text, (entry.spellings.get(text) ?? 0) + 1);
        entry.rows.add(row.rowIndex);
        entry.fields.add(field.key);
      }
    }
  }

  return kinds.flatMap(({ kind, fields: kindFields }) =>
    [...byKind.get(kind)!].map(([value, entry]) => {
      const seen = [...entry.spellings].map(([text, count]) => ({ text, count }));
      // Stable sort: equal counts keep the order they were first seen in
      const spellings = [...seen].sort((a, b) => b.count - a.count);
      return {
        kind,
        value,
        spellings,
        rows: [...entry.rows],
        fields: kindFields.map((f) => f.key).filter((key) => entry.fields.has(key)),
        defaultName: preferredSpelling(seen),
      };
    })
  );
}

const stripAccents = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '');
const hasAccents = (text: string) => stripAccents(text) !== text.normalize('NFD');

/**
 * The stored name for a new Related Record, from the spellings of its value
 * (in the order first seen): the most frequent spelling, preferring an
 * accented one over variants that differ from it only by accents. Accent-only
 * variants count together, so `Niccolo Rossi` ×3 and `Niccolò Rossi` ×1 give
 * `Niccolò Rossi`. Ties go to the spelling seen first.
 */
export function preferredSpelling(spellings: Spelling[]): string {
  const families = new Map<string, Spelling[]>();
  for (const spelling of spellings) {
    const family = stripAccents(spelling.text);
    families.set(family, [...(families.get(family) ?? []), spelling]);
  }

  let best: Spelling[] = [];
  let bestCount = -1;
  for (const family of families.values()) {
    const count = family.reduce((sum, s) => sum + s.count, 0);
    if (count > bestCount) {
      best = family;
      bestCount = count;
    }
  }

  const accented = best.filter((s) => hasAccents(s.text));
  const pool = accented.length > 0 ? accented : best;
  return pool.reduce<Spelling | undefined>((a, b) => (a === undefined || b.count > a.count ? b : a), undefined)?.text ?? '';
}

// ============================================================
// THE HOST APP LOOKUP
// ============================================================

/** Candidates found per kind, then per value; a value missing here has not been looked up */
export type LookupResults = ReadonlyMap<string, ReadonlyMap<string, RelatedCandidate[]>>;

function describe(value: unknown): string {
  if (Array.isArray(value)) return 'an array';
  if (value === null) return 'null';
  return typeof value;
}

function isCandidate(value: unknown): value is RelatedCandidate {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  const validId = (typeof c.id === 'string' && c.id !== '') || (typeof c.id === 'number' && Number.isFinite(c.id));
  return (
    validId &&
    typeof c.name === 'string' &&
    (c.description === undefined || typeof c.description === 'string') &&
    (c.match === 'normalised' || c.match === 'possible')
  );
}

/**
 * Read the Host App's answer to a lookup. The answer is checked, never
 * trusted: a value without a candidates list, or with a malformed candidate,
 * is a problem, because treating it as "nothing matches" would create a
 * duplicate of an existing record. `problems` are for the Host App's
 * developers (English).
 */
export function settleLookup(
  values: string[],
  answer: unknown
): { candidates: Map<string, RelatedCandidate[]>; problems: string[] } {
  const candidates = new Map<string, RelatedCandidate[]>();
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
    return {
      candidates,
      problems: [`findRelated must resolve with an object keyed by value; it resolved with ${describe(answer)}.`],
    };
  }

  const problems: string[] = [];
  const entries = answer as Record<string, unknown>;
  for (const value of values) {
    const list = Object.prototype.hasOwnProperty.call(entries, value) ? entries[value] : undefined;
    if (!Array.isArray(list)) {
      problems.push(`findRelated gave no candidates list for ${JSON.stringify(value)}; answer [] when nothing matches.`);
      continue;
    }
    const invalid = list.filter((c) => !isCandidate(c));
    if (invalid.length > 0) {
      problems.push(
        `findRelated gave malformed candidates for ${JSON.stringify(value)}: each needs an id (string or number), a name and match "normalised" or "possible". Got ${JSON.stringify(invalid)}.`
      );
      continue;
    }
    candidates.set(
      value,
      list.map((c: RelatedCandidate) => ({
        id: c.id,
        name: c.name,
        ...(c.description !== undefined && { description: c.description }),
        match: c.match,
      }))
    );
  }
  return { candidates, problems };
}

/**
 * Why a lookup failed: `hostMessage` is the message of the Error the Host
 * App's `findRelated` rejected with (its own text), or undefined when its
 * answer could not be read (`problems` then says why, for its developers).
 */
export class RelatedLookupError extends Error {
  constructor(
    readonly kind: string,
    readonly hostMessage: string | undefined,
    readonly problems: string[]
  ) {
    super(hostMessage ?? problems.join(' '));
    this.name = 'RelatedLookupError';
  }
}

/** Look up one kind's values with the Host App, once, and check the answer */
export async function lookupRelated(
  kind: string,
  values: string[],
  findRelated: FindRelated
): Promise<Map<string, RelatedCandidate[]>> {
  let answer: unknown;
  try {
    answer = await findRelated(kind, values);
  } catch (error) {
    throw new RelatedLookupError(kind, error instanceof Error ? error.message : String(error), []);
  }
  const { candidates, problems } = settleLookup(values, answer);
  if (problems.length > 0) throw new RelatedLookupError(kind, undefined, problems);
  return candidates;
}

// ============================================================
// DECIDING
// ============================================================

/**
 * How the lookup classified a value:
 * - `pending`: not looked up yet;
 * - `matched`: exactly one Normalised Match, linked automatically;
 * - `create`: nothing matched, so a new Related Record will be created;
 * - `homonyms`: several Normalised Matches: the Importer must choose;
 * - `possible`: no Normalised Match but Possible Matches: a new record will be
 *   created (kept separate) unless the Importer merges it with one of them.
 */
export type ResolutionGroup = 'pending' | 'matched' | 'create' | 'homonyms' | 'possible';

/** What Commit does for a value: link it to an existing record, or create a new one */
export type RelatedDecision =
  | { action: 'link'; id: RelatedRecordId; name: string }
  | { action: 'create'; name: string };

export interface ResolvedValue extends RelatedValue {
  group: ResolutionGroup;
  /** What the lookup found; empty while `pending` */
  candidates: RelatedCandidate[];
  /**
   * What Commit does for the value's rows without a row decision, or null
   * while the value still needs the Importer (or the lookup)
   */
  decision: RelatedDecision | null;
  /** What the value might be the same as, for the Importer to merge it with; empty when nothing */
  possibleMatches: PossibleMatch[];
  /** The Importer's merge that applies to the value, or null: kept separate (the default) */
  merge: MergeTarget | null;
  /**
   * The Importer's decisions for individual rows (by `rowIndex`), overriding
   * `decision` for those rows (Homonyms, Q27). Only rows using the value.
   */
  rowDecisions: ReadonlyMap<number, RelatedDecision>;
}

/** What Commit does for one row using a value: the row's own decision, else the value's */
export function decisionForRow(value: ResolvedValue, rowIndex: number): RelatedDecision | null {
  return value.rowDecisions.get(rowIndex) ?? value.decision;
}

/** The decision Commit applies to each row using a value, in file order (null: undecided) */
export function decisionsInEffect(value: ResolvedValue): Array<RelatedDecision | null> {
  if (value.rows.length === 0) return [value.decision];
  return value.rows.map((rowIndex) => decisionForRow(value, rowIndex));
}

/** Whether every row using the value has a decision: its own, or the value's */
export function isValueDecided(value: ResolvedValue): boolean {
  return value.group !== 'pending' && decisionsInEffect(value).every((decision) => decision !== null);
}

/**
 * Something a value might be the same Related Record as (a Possible Match):
 * another value of the file (`name` is its stored-name default, for showing),
 * an existing record the Host App's lookup flagged as `possible`, or (in Fix &
 * Retry) a value committed earlier (`name` is its stored-name default).
 */
export type PossibleMatch =
  | { source: 'file'; value: string; name: string }
  | { source: 'host'; candidate: RelatedCandidate }
  | { source: 'committed'; value: string; name: string };

/**
 * The Importer's choice to merge a value with one of its Possible Matches:
 * another value of the file (of the same kind), an existing record by ID, or
 * a value committed earlier (of the same kind).
 */
export type MergeTarget =
  | { source: 'file'; value: string }
  | { source: 'host'; id: RelatedRecordId }
  | { source: 'committed'; value: string };

/** What merging with a Possible Match records */
export function targetOf(match: PossibleMatch): MergeTarget {
  return match.source === 'host' ? { source: 'host', id: match.candidate.id } : { source: match.source, value: match.value };
}

/** Whether two merges (null: kept separate) are with the same thing */
export function sameTarget(a: MergeTarget | null, b: MergeTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.source === 'host') return b.source === 'host' && a.id === b.id;
  return b.source === a.source && a.value === b.value;
}

/**
 * A value an earlier Commit was made with (Fix & Retry), with the decisions
 * it was committed with; a record created then is linked to by its ID (see
 * `rememberCommitted`).
 */
export type CommittedValue = Pick<ResolvedValue, 'kind' | 'value' | 'defaultName' | 'decision' | 'rowDecisions'>;

const sameDecision = (a: RelatedDecision, b: RelatedDecision) =>
  a.action === 'link'
    ? b.action === 'link' && a.id === b.id
    : b.action === 'create' && normaliseForMatch(a.name) === normaliseForMatch(b.name);

/**
 * Whether a committed value can be merged with: every row it was committed
 * for points to the one record of its decision. A Homonym committed to
 * different records for different rows cannot, as merging would be ambiguous.
 */
function canMergeWithCommitted(value: CommittedValue): boolean {
  const { decision } = value;
  return decision !== null && [...value.rowDecisions.values()].every((rowDecision) => sameDecision(rowDecision, decision));
}

/** The group a value falls in, from its lookup candidates (undefined: not looked up) */
export function classifyCandidates(candidates: RelatedCandidate[] | undefined): ResolutionGroup {
  if (candidates === undefined) return 'pending';
  const normalised = candidates.filter((c) => c.match === 'normalised').length;
  if (normalised === 1) return 'matched';
  if (normalised > 1) return 'homonyms';
  return candidates.length > 0 ? 'possible' : 'create';
}

export interface ResolveOptions {
  /** Names the Importer gave new records, by `relatedValueKey`; the default name otherwise */
  names?: ReadonlyMap<string, string>;
  /** Decisions the Importer made, by `relatedValueKey`; they override the automatic ones and merges */
  decisions?: ReadonlyMap<string, RelatedDecision>;
  /**
   * Decisions the Importer made for individual rows, by `relatedValueKey`
   * then `rowIndex`: each overrides the value's decision for that row. Rows
   * no longer using the value are ignored.
   */
  rowDecisions?: ReadonlyMap<string, ReadonlyMap<number, RelatedDecision>>;
  /** Values the Importer merged with one of their Possible Matches, by `relatedValueKey` */
  merges?: ReadonlyMap<string, MergeTarget>;
  /**
   * Fix & Retry: the values committed earlier (see `rememberCommitted`). A
   * value without a Normalised Match is offered those of its kind it might
   * be, to merge with and take the decision they were committed with. They
   * are only merged into: never decided again, nor offered anything.
   */
  committed?: ReadonlyArray<CommittedValue>;
  /**
   * The Possible Matches: `findPossibleMatches(values)`, or with `committed`
   * `findPossibleMatches([...values, ...committed])`. Found here when not given.
   */
  possibleMatches?: PossiblePair[];
}

/** A new record's name is stored trimmed */
const trimName = (decision: RelatedDecision): RelatedDecision =>
  decision.action === 'create' ? { action: 'create', name: decision.name.trim() } : decision;

/**
 * Decide what can be decided without the Importer, and apply the Importer's
 * choices:
 * - a value with exactly one Normalised Match links to it;
 * - a value with no Normalised Match (no candidates, or only Possible
 *   Matches) will be created, with the Importer's name for it or its default
 *   name: it is kept separate from its Possible Matches unless merged;
 * - Homonyms are never decided here: they stay `null` until the Importer
 *   decides (`decisions`).
 *
 * A value merged (`merges`) with an existing record links to it. A value
 * merged with another value of the file takes that value's decision, so
 * merged values to be created make one record, whose default name is the
 * preferred spelling across all of them (`preferredSpelling`). A value merged
 * with a value committed earlier (`committed`) takes the decision that value
 * was committed with: its record, or, if that record could not be created,
 * the same one creation. A merge with something no longer offered (see
 * `possibleMatches`) is ignored.
 *
 * Decisions for individual rows (`rowDecisions`, Homonyms) override the
 * value's decision for those rows; rows no longer using the value are ignored.
 */
export function resolveValues(
  values: RelatedValue[],
  lookups: LookupResults,
  { names, decisions, rowDecisions, merges, committed = [], possibleMatches }: ResolveOptions = {}
): ResolvedValue[] {
  const found = values.map((value) => lookups.get(value.kind)?.get(value.value));
  const groups = found.map(classifyCandidates);
  const keys = values.map((value) => relatedValueKey(value.kind, value.value));
  // The committed values that can be merged with; a value being resolved is never one of them
  const inValues = new Set(keys);
  const earlier = new Map(
    committed
      .filter((value) => !inValues.has(relatedValueKey(value.kind, value.value)) && canMergeWithCommitted(value))
      .map((value) => [relatedValueKey(value.kind, value.value), value])
  );
  const offered = offerPossibleMatches(
    values,
    found,
    groups,
    earlier,
    possibleMatches ?? findPossibleMatches([...values, ...earlier.values()])
  );

  // The merges that apply: only with something offered, and never over a decision of the Importer
  const merge = keys.map((key, i): MergeTarget | null => {
    const target = merges?.get(key);
    if (!target || decisions?.has(key)) return null;
    return offered[i].some((match) => sameTarget(targetOf(match), target)) ? target : null;
  });

  // A value merged with a value of the file takes the decision of the value at the end of the chain.
  // Values are only offered a value used more (or matched), so chains never loop; `seen` guards anyway
  const indexOf = new Map(keys.map((key, i) => [key, i]));
  const rootOf = (i: number, seen = new Set<number>()): number => {
    const target = merge[i];
    if (target?.source !== 'file' || seen.has(i)) return i;
    seen.add(i);
    return rootOf(indexOf.get(relatedValueKey(values[i].kind, target.value))!, seen);
  };
  const roots = values.map((_, i) => rootOf(i));

  // A record created for merged values is named from all their spellings
  const defaultNames = values.map((value, i) => {
    const merged = values.filter((_, j) => j !== i && roots[j] === i);
    return merged.length === 0 ? value.defaultName : preferredSpelling([value, ...merged].flatMap((v) => v.spellings));
  });

  const decide = (i: number): RelatedDecision | null => {
    const decided = decisions?.get(keys[i]);
    if (decided) return trimName(decided);
    const target = merge[i];
    if (target?.source === 'host') {
      const candidate = found[i]!.find((c) => c.id === target.id)!;
      return { action: 'link', id: candidate.id, name: candidate.name };
    }
    if (target?.source === 'committed') return earlier.get(relatedValueKey(values[i].kind, target.value))!.decision;
    if (groups[i] === 'matched') {
      const match = found[i]!.find((c) => c.match === 'normalised')!;
      return { action: 'link', id: match.id, name: match.name };
    }
    if (mergeable(groups[i])) return { action: 'create', name: (names?.get(keys[i]) ?? defaultNames[i]).trim() };
    return null;
  };
  const decided = values.map((_, i) => (roots[i] === i ? decide(i) : null));

  // The Importer's choices for individual rows, only for rows still using the value
  const rowDecisionsOf = (value: RelatedValue, key: string): Map<number, RelatedDecision> => {
    const chosen = rowDecisions?.get(key);
    const byRow = new Map<number, RelatedDecision>();
    for (const rowIndex of value.rows) {
      const rowDecision = chosen?.get(rowIndex);
      if (rowDecision) byRow.set(rowIndex, trimName(rowDecision));
    }
    return byRow;
  };

  return values.map((value, i) => ({
    ...value,
    defaultName: defaultNames[i],
    group: groups[i],
    candidates: found[i] ?? [],
    decision: decided[roots[i]],
    rowDecisions: rowDecisionsOf(value, keys[i]),
    possibleMatches: offered[i],
    merge: merge[i],
  }));
}

/** Whether a value was looked up and has no Normalised Match, so it may be merged with a Possible Match */
const mergeable = (group: ResolutionGroup) => group === 'create' || group === 'possible';

/**
 * What each value is offered to merge with. Only values looked up and
 * without a Normalised Match are offered anything: the lookup's Possible
 * Matches, then the values of the file they might be, then the values
 * committed earlier they might be (`committed`, Fix & Retry). A pair of
 * values of the file is offered one way only, so merges never go round in
 * circles: into the value with a Normalised Match, else into the value used
 * in more rows (the one seen first when equal). A committed value is only
 * ever merged into, never offered anything, so it is never decided again.
 * Two values that both have Normalised Matches are never offered, nor a value
 * (of the file or committed) linked to a record the lookup already offers.
 */
function offerPossibleMatches(
  values: RelatedValue[],
  found: Array<RelatedCandidate[] | undefined>,
  groups: ResolutionGroup[],
  committed: ReadonlyMap<string, CommittedValue>,
  pairs: PossiblePair[]
): PossibleMatch[][] {
  const fromHost: PossibleMatch[][] = values.map((_, i) =>
    mergeable(groups[i])
      ? found[i]!.filter((c) => c.match === 'possible').map((candidate) => ({ source: 'host' as const, candidate }))
      : []
  );
  const fromFile: number[][] = values.map(() => []);
  const fromCommitted: CommittedValue[][] = values.map(() => []);
  const hostOffers = (i: number, id: RelatedRecordId | undefined) =>
    id !== undefined && fromHost[i].some((m) => m.source === 'host' && m.candidate.id === id);

  const indexOf = new Map(values.map((value, i) => [relatedValueKey(value.kind, value.value), i]));
  const outranks = (a: number, b: number) =>
    mergeable(groups[a]) !== mergeable(groups[b])
      ? !mergeable(groups[a])
      : values[a].rows.length > values[b].rows.length || (values[a].rows.length === values[b].rows.length && a < b);

  for (const { kind, values: pair } of pairs) {
    const [a, b] = pair.map((value) => indexOf.get(relatedValueKey(kind, value)));
    if (a !== undefined && b !== undefined) {
      if (groups[a] === 'pending' || groups[b] === 'pending') continue;
      if (!mergeable(groups[a]) && !mergeable(groups[b])) continue;
      const [from, into] = outranks(a, b) ? [b, a] : [a, b];
      const matchedTo = groups[into] === 'matched' ? found[into]!.find((c) => c.match === 'normalised')!.id : undefined;
      if (hostOffers(from, matchedTo) || fromFile[from].includes(into)) continue;
      fromFile[from].push(into);
      continue;
    }
    // A value being resolved and a committed value: always into the committed one
    const from = a ?? b;
    const into = committed.get(relatedValueKey(kind, a === undefined ? pair[0] : pair[1]));
    if (from === undefined || !into || !mergeable(groups[from])) continue;
    const linkedTo = into.decision?.action === 'link' ? into.decision.id : undefined;
    if (hostOffers(from, linkedTo) || fromCommitted[from].includes(into)) continue;
    fromCommitted[from].push(into);
  }

  return fromHost.map((host, i) => [
    ...host,
    ...fromFile[i]
      .sort((x, y) => x - y)
      .map((j): PossibleMatch => ({ source: 'file', value: values[j].value, name: values[j].defaultName })),
    ...fromCommitted[i].map((value): PossibleMatch => ({ source: 'committed', value: value.value, name: value.defaultName })),
  ]);
}

/**
 * What stops Commit: values not looked up yet, values with rows waiting for
 * the Importer's decision, and new records without a name (only those some
 * row will point to). Commit may start only when all three are 0.
 */
export function resolutionBlockers(resolved: ResolvedValue[]): { pending: number; undecided: number; unnamed: number } {
  let pending = 0;
  let undecided = 0;
  let unnamed = 0;
  for (const value of resolved) {
    const inEffect = decisionsInEffect(value);
    if (value.group === 'pending') pending++;
    else if (inEffect.some((decision) => decision === null)) undecided++;
    else if (inEffect.some((decision) => decision?.action === 'create' && decision.name === '')) unnamed++;
  }
  return { pending, undecided, unnamed };
}
