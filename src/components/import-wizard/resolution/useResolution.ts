import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  FieldConfig,
  HostAppAdapter,
  RelatedCandidate,
  RelatedRecordId,
  RowValidation,
} from '@/lib/import-wizard/types';
import type { ResolvedMessages } from '@/lib/import-wizard/messages';
import {
  collectRelatedValues,
  lookupRelated,
  relatedValueKey,
  RelatedLookupError,
  relationshipKinds,
  resolutionBlockers,
  resolveValues,
  type LookupResults,
  type MergeTarget,
  type RelatedDecision,
  type RelatedValue,
  type ResolvedValue,
} from '@/lib/import-wizard/resolution';
import { findPossibleMatches } from '@/lib/import-wizard/possible';

/**
 * What the Importer chose for a Homonym, for the whole value or one row: an
 * existing record, or a new one. A new record's name is not part of the
 * choice: it is the value's name (`names`), so every row of a value assigned
 * to "create new" points to the same one new record.
 */
export type RelatedChoice = { action: 'link'; id: RelatedRecordId; name: string } | { action: 'create' };

/** The Host App lookup for the values not looked up yet */
export type LookupState =
  | { status: 'idle' }
  /** `fields` is the labels of the kinds being looked up, comma-separated */
  | { status: 'loading'; fields: string; count: number }
  /** `reason` is the Host App's Error message, or the catalogue's `invalidLookup` */
  | { status: 'error'; fields: string; reason: string }
  | { status: 'ready' };

interface UseResolutionOptions<TRecord, TKey extends string> {
  fields: FieldConfig<TKey>[];
  /** The rows as reviewed; Excluded Rows are ignored */
  rows: RowValidation<TRecord>[];
  adapter: HostAppAdapter<TRecord>;
  messages: ResolvedMessages;
  /** Whether the Resolution step is showing; the file's values are only collected then */
  active: boolean;
}

/**
 * The Resolution step's state: the distinct values of the file's Relationship
 * Fields, what the Host App's lookup found for them, the names the Importer
 * gave new records, the Importer's choices for Homonyms (per value and per
 * row), the Possible Matches they merged, and what Commit will do for each
 * value and row. The Importer's names, choices and merges are kept for the
 * life of the wizard, so they survive going back to the review.
 *
 * Lookups are kept for the life of the wizard: opening Resolution again
 * (after changes in the review) looks up only values not looked up before,
 * once per kind. Nothing is created here.
 */
export function useResolution<TRecord, TKey extends string>({
  fields,
  rows,
  adapter,
  messages: m,
  active,
}: UseResolutionOptions<TRecord, TKey>) {
  const kinds = useMemo(() => relationshipKinds(fields), [fields]);
  const [lookups, setLookups] = useState<LookupResults>(() => new Map());
  // What the Importer typed as new records' names, by relatedValueKey
  const [names, setNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  // Values the Importer merged with a Possible Match, by relatedValueKey; kept separate otherwise
  const [merges, setMerges] = useState<ReadonlyMap<string, MergeTarget>>(() => new Map());
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });
  // The values as last resolved, for the review grid's badges
  const [badges, setBadges] = useState<ReadonlyMap<string, ResolvedValue>>(() => new Map());
  // Bumped when a lookup starts or Resolution is left, so late answers don't change the step
  const requestRef = useRef(0);

  // What the Importer chose for Homonyms, by relatedValueKey: for the whole value, and per rowIndex.
  // Kept for the life of the wizard, like names: they apply again whenever the value (or row) is back.
  const [choices, setChoices] = useState<ReadonlyMap<string, RelatedChoice>>(() => new Map());
  const [rowChoices, setRowChoices] = useState<ReadonlyMap<string, ReadonlyMap<number, RelatedChoice>>>(
    () => new Map()
  );

  const values = useMemo(() => (active ? collectRelatedValues(rows, fields) : []), [active, rows, fields]);
  // Found once per file state, not on every keystroke in a name
  const possibleMatches = useMemo(() => findPossibleMatches(values), [values]);
  const resolved = useMemo(() => {
    const decisions = new Map<string, RelatedDecision>();
    const rowDecisions = new Map<string, Map<number, RelatedDecision>>();
    for (const value of values) {
      const key = relatedValueKey(value.kind, value.value);
      const decide = (choice: RelatedChoice) => toDecision(choice, value, names.get(key));
      const choice = choices.get(key);
      if (choice) decisions.set(key, decide(choice));
      const forRows = rowChoices.get(key);
      if (forRows) rowDecisions.set(key, new Map([...forRows].map(([rowIndex, c]) => [rowIndex, decide(c)])));
    }
    return resolveValues(values, lookups, { names, decisions, rowDecisions, merges, possibleMatches });
  }, [values, lookups, names, choices, rowChoices, merges, possibleMatches]);
  const blockers = useMemo(() => resolutionBlockers(resolved), [resolved]);
  const canCommit =
    lookup.status === 'ready' && blockers.pending === 0 && blockers.undecided === 0 && blockers.unnamed === 0;

  const labelsOf = useCallback(
    (kindNames: string[]) =>
      kinds
        .filter(({ kind }) => kindNames.includes(kind))
        .map(({ fields: kindFields }) => kindFields.map((f) => f.label).join(', '))
        .join('; '),
    [kinds]
  );

  /**
   * Look up the values not looked up yet, once per kind, in parallel.
   * Resolves with the failure's text when a lookup failed (for an ERROR
   * event), or null.
   */
  const start = useCallback(async (): Promise<string | null> => {
    const request = ++requestRef.current;
    const current = collectRelatedValues(rows, fields);
    const missing = kinds
      .map(({ kind }) => ({
        kind,
        values: current.filter((v) => v.kind === kind && !lookups.get(kind)?.has(v.value)).map((v) => v.value),
      }))
      .filter(({ values: kindValues }) => kindValues.length > 0);

    if (missing.length === 0) {
      setLookup({ status: 'ready' });
      return null;
    }

    const loadingFields = labelsOf(missing.map(({ kind }) => kind));
    setLookup({ status: 'loading', fields: loadingFields, count: missing.length });

    const { findRelated, createRelated } = adapter;
    if (typeof findRelated !== 'function' || typeof createRelated !== 'function') {
      console.error(
        '[data-weaver] The Output Shape has Relationship Fields, so the Host App adapter needs findRelated and createRelated.'
      );
      const failure = { fields: loadingFields, reason: m.resolution.invalidLookup() };
      setLookup({ status: 'error', ...failure });
      return m.resolution.lookupFailed(failure);
    }

    const settled = await Promise.allSettled(
      // Called on the adapter, so a Host App's class instance keeps its `this`
      missing.map(({ kind, values: kindValues }) =>
        lookupRelated(kind, kindValues, (k, v) => adapter.findRelated!(k, v))
      )
    );

    // Answers that arrived are kept, even if Resolution was left meanwhile
    setLookups((previous) => {
      const next = new Map(previous);
      settled.forEach((outcome, i) => {
        if (outcome.status !== 'fulfilled') return;
        const { kind } = missing[i];
        next.set(kind, new Map<string, RelatedCandidate[]>([...(previous.get(kind) ?? []), ...outcome.value]));
      });
      return next;
    });

    const failed = settled.flatMap((outcome, i) => (outcome.status === 'rejected' ? [{ kind: missing[i].kind, error: outcome.reason }] : []));
    for (const { error } of failed) {
      if (error instanceof RelatedLookupError) {
        for (const problem of error.problems) console.error(`[data-weaver] ${problem}`);
      }
    }
    if (request !== requestRef.current) return null;

    if (failed.length === 0) {
      setLookup({ status: 'ready' });
      return null;
    }
    const [first] = failed;
    const hostMessage = first.error instanceof RelatedLookupError ? first.error.hostMessage : String(first.error);
    const failure = { fields: labelsOf(failed.map(({ kind }) => kind)), reason: hostMessage ?? m.resolution.invalidLookup() };
    setLookup({ status: 'error', ...failure });
    return m.resolution.lookupFailed(failure);
  }, [rows, fields, kinds, lookups, labelsOf, adapter, m]);

  /** Leave Resolution for the review: late lookups no longer change the step, and the grid shows badges */
  const leave = useCallback(() => {
    requestRef.current++;
    setBadges(new Map(resolved.filter((v) => v.group !== 'pending').map((v) => [relatedValueKey(v.kind, v.value), v])));
  }, [resolved]);

  const setName = useCallback((key: string, name: string) => {
    setNames((previous) => new Map(previous).set(key, name));
  }, []);

  /** Choose for a whole value (a Homonym), by relatedValueKey */
  const choose = useCallback((key: string, choice: RelatedChoice) => {
    setChoices((previous) => new Map(previous).set(key, choice));
  }, []);

  /** Choose for one row of a value, or (null) let it follow the value's choice again */
  const chooseForRow = useCallback((key: string, rowIndex: number, choice: RelatedChoice | null) => {
    setRowChoices((previous) => {
      const forRows = new Map(previous.get(key));
      if (choice) forRows.set(rowIndex, choice);
      else forRows.delete(rowIndex);
      return new Map(previous).set(key, forRows);
    });
  }, []);

  /** Merge a value with one of its Possible Matches, or keep it separate (null) */
  const setMerge = useCallback((key: string, target: MergeTarget | null) => {
    setMerges((previous) => {
      const next = new Map(previous);
      if (target) next.set(key, target);
      else next.delete(key);
      return next;
    });
  }, []);

  return {
    /** The Output Shape's Relationship Fields by kind; empty when it has none */
    kinds,
    lookup,
    /** Every distinct value, with its candidates and decision; empty unless `active` */
    resolved,
    names,
    blockers,
    /** Whether Commit may start: everything looked up, decided and named */
    canCommit,
    /** The values as resolved when Resolution was last left, by relatedValueKey */
    badges,
    start,
    leave,
    setName,
    choose,
    chooseForRow,
    setMerge,
  };
}

/** A choice as Commit applies it: "create new" takes the value's name, as typed or by default */
function toDecision(choice: RelatedChoice, value: RelatedValue, typedName: string | undefined): RelatedDecision {
  return choice.action === 'create' ? { action: 'create', name: typedName ?? value.defaultName } : choice;
}
