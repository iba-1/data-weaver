/**
 * Resolution: before Commit, every distinct Relationship Field value in the
 * file is matched once to an existing Related Record or marked to be created
 * (ADR-0001). This module collects the values, reads the Host App's lookup
 * and decides what can be decided without the Importer. Nothing here creates
 * anything: creating happens at the start of Commit (`related.ts`).
 */

import type { FieldConfig, FindRelated, RelatedCandidate, RelatedRecordId } from './types';
import { normaliseForMatch } from './normalise';
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
 * - `possible`: no Normalised Match but Possible Matches: the Importer must
 *   choose between one of them and a new record.
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
  /** Decisions the Importer made, by `relatedValueKey`; they override the automatic ones */
  decisions?: ReadonlyMap<string, RelatedDecision>;
  /**
   * Decisions the Importer made for individual rows, by `relatedValueKey`
   * then `rowIndex`: each overrides the value's decision for that row. Rows
   * no longer using the value are ignored.
   */
  rowDecisions?: ReadonlyMap<string, ReadonlyMap<number, RelatedDecision>>;
}

/** A new record's name is stored trimmed */
const trimName = (decision: RelatedDecision): RelatedDecision =>
  decision.action === 'create' ? { action: 'create', name: decision.name.trim() } : decision;

/**
 * Decide what can be decided without the Importer: a value with exactly one
 * Normalised Match links to it, a value with no candidates will be created
 * (with the Importer's name for it, or its default name). Homonyms and
 * Possible Matches are never decided here: they stay `null` until the
 * Importer decides (`decisions`, and `rowDecisions` for individual rows).
 */
export function resolveValues(
  values: RelatedValue[],
  lookups: LookupResults,
  { names, decisions, rowDecisions }: ResolveOptions = {}
): ResolvedValue[] {
  return values.map((value) => {
    const found = lookups.get(value.kind)?.get(value.value);
    const group = classifyCandidates(found);
    const key = relatedValueKey(value.kind, value.value);
    const name = (names?.get(key) ?? value.defaultName).trim();

    const chosen = decisions?.get(key);
    let decision: RelatedDecision | null = chosen ? trimName(chosen) : null;
    if (!decision && group === 'matched') {
      const match = found!.find((c) => c.match === 'normalised')!;
      decision = { action: 'link', id: match.id, name: match.name };
    }
    if (!decision && group === 'create') decision = { action: 'create', name };

    const chosenForRows = rowDecisions?.get(key);
    const byRow = new Map<number, RelatedDecision>();
    for (const rowIndex of value.rows) {
      const rowDecision = chosenForRows?.get(rowIndex);
      if (rowDecision) byRow.set(rowIndex, trimName(rowDecision));
    }

    return { ...value, group, candidates: found ?? [], decision, rowDecisions: byRow };
  });
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
