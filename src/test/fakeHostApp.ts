/**
 * A fake Host App for tests: a `HostAppAdapter` backed by an in-memory store
 * that honours Import Keys (a key already saved is answered `created` and not
 * saved again), as ADR-0002 requires of real Host Apps.
 *
 * Tests script it per batch call (numbered from 1): reject chosen rows, fail a
 * batch before saving it, lose a batch's answer after saving it, tamper with
 * the answer, or hold a batch until the test releases it.
 */

import type { HostAppAdapter, ImportRow, RowOutcome } from '@/lib/import-wizard/types';

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
  const holds = new Map<number, { gate: Promise<void>; arrive: () => void }>();
  let inFlight = 0;

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
    records: () => [...fake.store.values()].map((row) => row.record),
    adapter: {
      saveBatch: async (rows) => {
        fake.calls.push(rows);
        const call = fake.calls.length;
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
