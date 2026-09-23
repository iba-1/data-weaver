import { useCallback, useMemo, useRef, useState } from 'react';
import type { FieldConfig, HostAppAdapter, RelatedCandidate, RowValidation } from '@/lib/import-wizard/types';
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
  type ResolvedValue,
} from '@/lib/import-wizard/resolution';

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
 * gave new records, and what Commit will do for each value.
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
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });
  // The values as last resolved, for the review grid's badges
  const [badges, setBadges] = useState<ReadonlyMap<string, ResolvedValue>>(() => new Map());
  // Bumped when a lookup starts or Resolution is left, so late answers don't change the step
  const requestRef = useRef(0);

  const values = useMemo(() => (active ? collectRelatedValues(rows, fields) : []), [active, rows, fields]);
  const resolved = useMemo(() => resolveValues(values, lookups, { names }), [values, lookups, names]);
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
  };
}
