/**
 * A fake Host App for tests: a `HostAppAdapter` backed by an in-memory store
 * that honours Import Keys (a key already saved is answered `created` and not
 * saved again), as ADR-0002 requires of real Host Apps.
 *
 * Tests script it per batch call (numbered from 1): reject chosen rows, fail a
 * batch before saving it, lose a batch's answer after saving it, tamper with
 * the answer, or hold a batch until the test releases it.
 *
 * It also keeps Related Records per kind (e.g. `registry`), found by the
 * Normalised Match rule like a real Host App's lookup (several records with
 * the same name are Homonyms), and can flag Possible Matches, fail a lookup
 * or fail to create a chosen record.
 */

import type {
  HostAppAdapter,
  ImportRow,
  RelatedCandidate,
  RelatedRecordId,
  RowOutcome,
} from '@/lib/import-wizard/types';
import { normaliseForMatch } from '@/lib/import-wizard/normalise';

/** A Related Record in the fake's store */
export interface FakeRelatedRecord {
  id: RelatedRecordId;
  name: string;
  description?: string;
}

/** How the fake answers one `findRelated` call */
export type LookupScript =
  /** Reject the promise, as when the lookup request fails */
  | { fail: unknown }
  /** Answer with whatever this returns instead of the honest answer */
  | { answer: (honest: Record<string, RelatedCandidate[]>) => unknown };

/** How the fake answers one `saveBatch` call */
export type BatchScript =
  /** Reject the promise without saving anything, as when the request never arrives */
  | { fail: unknown }
  /** Save the rows, then reject the promise, as when the answer is lost on the way back */
  | { lose: unknown }
  /** Save the rows honestly, then answer with whatever this returns instead of the honest outcomes */
  | { answer: (honest: RowOutcome[], rows: ImportRow<unknown>[]) => unknown };

export interface FakeHostAppOptions<TRecord> {
  /**
   * The Host App's own rules: return a reason (and optionally a field) to
   * refuse a row, or nothing to save it. Called only for keys not yet saved.
   */
  reject?: (row: ImportRow<TRecord>) => { reason: string; field?: string } | null | undefined | false;
  /** Existing Related Records by kind; records without an `id` get `<kind>-<n>` */
  related?: Record<string, Array<Omit<FakeRelatedRecord, 'id'> & { id?: RelatedRecordId }>>;
  /** Whether a record not found by Normalised Match is a Possible Match of a looked-up value */
  possible?: (kind: string, value: string, record: FakeRelatedRecord) => boolean;
  /** Refuse to create a record: return the reason (the Error message), or nothing to create it */
  failCreate?: (kind: string, name: string) => string | null | undefined | false;
}

export interface FakeHostApp<TRecord> {
  adapter: HostAppAdapter<TRecord>;
  /** The saved records, by Import Key, in the order they were saved */
  store: Map<string, ImportRow<TRecord>>;
  /** The saved records, in the order they were saved */
  records(): TRecord[];
  /** Every `saveBatch` call's rows, in call order */
  calls: ImportRow<TRecord>[][];
  /** How many times a row was written to the store; more than `store.size` means a duplicate */
  writes: number;
  /** Most `saveBatch` calls in progress at the same time */
  maxConcurrentCalls: number;
  /** The Related Records by kind, including those created during the test */
  related: Map<string, FakeRelatedRecord[]>;
  /** Every `findRelated` call, in call order */
  lookups: Array<{ kind: string; values: string[] }>;
  /** Every `createRelated` call, in call order, whether or not it succeeded */
  creates: Array<{ kind: string; name: string }>;
  /** Most `createRelated` calls in progress at the same time */
  maxConcurrentCreates: number;
  /** Every adapter call in order: `findRelated <kind>`, `createRelated <kind> <name>`, `saveBatch <n>` */
  log: string[];
  /** Script the answer to the `call`-th `findRelated` call (from 1) */
  onLookup(call: number, script: LookupScript): void;
  /** Script the answer to the `call`-th `saveBatch` call (from 1) */
  onCall(call: number, script: BatchScript): void;
  /**
   * Make the `call`-th `saveBatch` call wait until the returned function is
   * called. Resolves `reached` once the call has started.
   */
  hold(call: number): { release: () => void; reached: Promise<void> };
}

export function createFakeHostApp<TRecord = Record<string, unknown>>(
  options: FakeHostAppOptions<TRecord> = {}
): FakeHostApp<TRecord> {
  const scripts = new Map<number, BatchScript>();
  const lookupScripts = new Map<number, LookupScript>();
  const holds = new Map<number, { gate: Promise<void>; arrive: () => void }>();
  let inFlight = 0;
  let createsInFlight = 0;
  let nextId = 1;

  const related = new Map<string, FakeRelatedRecord[]>(
    Object.entries(options.related ?? {}).map(([kind, records]) => [
      kind,
      records.map((record) => ({ ...record, id: record.id ?? `${kind}-${nextId++}` })),
    ])
  );

  const candidatesFor = (kind: string, value: string): RelatedCandidate[] =>
    (related.get(kind) ?? []).flatMap((record): RelatedCandidate[] => {
      const base = { id: record.id, name: record.name, ...(record.description && { description: record.description }) };
      if (normaliseForMatch(record.name) === value) return [{ ...base, match: 'normalised' }];
      if (options.possible?.(kind, value, record)) return [{ ...base, match: 'possible' }];
      return [];
    });

  const save = (rows: ImportRow<TRecord>[]): RowOutcome[] =>
    rows.map((row) => {
      if (fake.store.has(row.importKey)) return { importKey: row.importKey, status: 'created' };
      const refusal = options.reject?.(row);
      if (refusal) return { importKey: row.importKey, status: 'rejected', ...refusal };
      fake.store.set(row.importKey, row);
      fake.writes++;
      return { importKey: row.importKey, status: 'created' };
    });

  const fake: FakeHostApp<TRecord> = {
    store: new Map(),
    calls: [],
    writes: 0,
    maxConcurrentCalls: 0,
    related,
    lookups: [],
    creates: [],
    maxConcurrentCreates: 0,
    log: [],
    records: () => [...fake.store.values()].map((row) => row.record),
    adapter: {
      findRelated: async (kind, values) => {
        fake.lookups.push({ kind, values: [...values] });
        fake.log.push(`findRelated ${kind}`);
        const call = fake.lookups.length;
        await Promise.resolve();
        const script = lookupScripts.get(call);
        if (script && 'fail' in script) throw script.fail;
        const honest = Object.fromEntries(values.map((value) => [value, candidatesFor(kind, value)]));
        if (script && 'answer' in script) return script.answer(honest) as Record<string, RelatedCandidate[]>;
        return honest;
      },
      createRelated: async (kind, name) => {
        fake.creates.push({ kind, name });
        fake.log.push(`createRelated ${kind} ${name}`);
        createsInFlight++;
        fake.maxConcurrentCreates = Math.max(fake.maxConcurrentCreates, createsInFlight);
        try {
          await Promise.resolve();
          const refusal = options.failCreate?.(kind, name);
          if (refusal) throw new Error(refusal);
          const record = { id: `${kind}-${nextId++}`, name };
          related.set(kind, [...(related.get(kind) ?? []), record]);
          return record.id;
        } finally {
          createsInFlight--;
        }
      },
      saveBatch: async (rows) => {
        fake.calls.push(rows);
        const call = fake.calls.length;
        fake.log.push(`saveBatch ${call}`);
        inFlight++;
        fake.maxConcurrentCalls = Math.max(fake.maxConcurrentCalls, inFlight);
        try {
          const held = holds.get(call);
          if (held) {
            held.arrive();
            await held.gate;
          }
          // A real Host App answers asynchronously
          await Promise.resolve();

          const script = scripts.get(call);
          if (script && 'fail' in script) throw script.fail;
          const honest = save(rows);
          if (script && 'lose' in script) throw script.lose;
          if (script && 'answer' in script) return script.answer(honest, rows) as RowOutcome[];
          return honest;
        } finally {
          inFlight--;
        }
      },
    },
    onCall(call, script) {
      scripts.set(call, script);
    },
    onLookup(call, script) {
      lookupScripts.set(call, script);
    },
    hold(call) {
      let release!: () => void;
      let arrive!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const reached = new Promise<void>((resolve) => (arrive = resolve));
      holds.set(call, { gate, arrive });
      return { release, reached };
    },
  };
  return fake;
}
