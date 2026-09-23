/**
 * Commit: saving the import's rows through the Host App's `saveBatch`, in
 * batches, one batch at a time, and turning its answers into per-row outcomes.
 *
 * Every row carries an Import Key so the Host App can ignore a row it has
 * already saved (ADR-0002). The Host App's answer is checked, never trusted:
 * a row only counts as imported when the answer has exactly one valid
 * `created` outcome for its key.
 *
 * A batch that fails in transit is sent again, with the same rows and Import
 * Keys, a few times with backoff before its rows are given up on.
 */

import type { BatchRetry, CommitProgress, ImportReport, ImportRow, RejectedRow, RetryOptions, SaveBatch } from './types';
import { ENGLISH_MESSAGES, type ResolvedMessages } from './messages';

/** Rows per `saveBatch` call unless the Host App sets `batchSize` */
export const DEFAULT_BATCH_SIZE = 100;

/**
 * How a batch that fails in transit is retried unless the Host App says
 * otherwise: 3 attempts in total, waiting about 1 s and then about 2 s, so a
 * brief network drop is ridden out without keeping the Importer waiting long.
 */
export const DEFAULT_RETRY: Readonly<Required<RetryOptions>> = Object.freeze({
  attempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
});

const isNumberFrom = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min;

/**
 * The retry policy to use: whole attempts of at least 1, waits of at least 0
 * and a longest wait no shorter than the first. Anything else falls back to
 * `DEFAULT_RETRY`.
 */
export function normaliseRetry(options?: RetryOptions): Required<RetryOptions> {
  const baseDelayMs = isNumberFrom(options?.baseDelayMs, 0) ? options.baseDelayMs : DEFAULT_RETRY.baseDelayMs;
  const maxDelayMs = isNumberFrom(options?.maxDelayMs, 0) ? options.maxDelayMs : DEFAULT_RETRY.maxDelayMs;
  return {
    attempts: isNumberFrom(options?.attempts, 1) ? Math.floor(options.attempts) : DEFAULT_RETRY.attempts,
    baseDelayMs,
    maxDelayMs: Math.max(baseDelayMs, maxDelayMs),
  };
}

/**
 * The wait before the `retry`-th retry (from 1), in milliseconds: exponential
 * backoff (`baseDelayMs`, doubling each time, at most `maxDelayMs`) with
 * "equal jitter", a random wait between half and all of it, so many
 * Importers who lost the connection at once don't all come back together.
 */
export function retryDelay(retry: number, policy: Required<RetryOptions>, random: () => number = Math.random): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (retry - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/** Wait `ms`, or less if `signal` is aborted first */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

/** The parts of Web Crypto an Import Key can be made from */
type RandomSource = Partial<Pick<Crypto, 'randomUUID' | 'getRandomValues'>>;

/**
 * A new Import Key: a random (version 4) UUID. Uses `crypto.randomUUID` where
 * the Host App's page has it (it needs a secure context), otherwise builds one
 * from `crypto.getRandomValues`, and only without Web Crypto at all from
 * `Math.random`.
 */
export function createImportKey(random: RandomSource | undefined = globalThis.crypto): string {
  if (typeof random?.randomUUID === 'function') return random.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof random?.getRandomValues === 'function') {
    random.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // RFC 4122 version 4, variant 10xx
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** One Import Key per data row of a file, by `rowIndex` */
export function createImportKeys(count: number, random?: RandomSource): string[] {
  return Array.from({ length: count }, () => createImportKey(random));
}

/** The batch size to use: a whole number of at least 1, or the default */
export function normaliseBatchSize(size: number | undefined): number {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 1) return DEFAULT_BATCH_SIZE;
  return Math.floor(size);
}

/** Split items into consecutive batches of at most `size` */
export function toBatches<T>(items: T[], size: number): T[][] {
  const batchSize = normaliseBatchSize(size);
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    batches.push(items.slice(start, start + batchSize));
  }
  return batches;
}

/** What became of one batch */
export interface BatchResult<TRecord> {
  created: ImportRow<TRecord>[];
  rejected: RejectedRow<TRecord>[];
  /**
   * Ways the Host App's answer broke the `saveBatch` contract, for its
   * developers (English, not shown to the Importer)
   */
  problems: string[];
  /** Set when the batch could not be sent: what its last attempt rejected with */
  error?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return 'an array';
  if (value === null) return 'null';
  return typeof value;
}

/**
 * Turn the Host App's answer to a batch into one outcome per row sent. A row
 * is created only when the answer holds exactly one `created` outcome for its
 * Import Key. A row with no outcome, several outcomes or an unrecognised one
 * becomes a Rejected Row (`invalidAnswer`): if it was in fact saved, sending
 * it again is safe, because the Host App honours its Import Key. Outcomes for
 * keys that were not sent are ignored.
 */
export function settleBatch<TRecord>(
  rows: ImportRow<TRecord>[],
  answer: unknown,
  messages: ResolvedMessages = ENGLISH_MESSAGES
): BatchResult<TRecord> {
  const result: BatchResult<TRecord> = { created: [], rejected: [], problems: [] };
  const invalid = (row: ImportRow<TRecord>): RejectedRow<TRecord> => ({
    ...row,
    reason: messages.commit.invalidAnswer(),
    cause: 'invalidAnswer',
  });

  if (!Array.isArray(answer)) {
    result.problems.push(`saveBatch must resolve with an array of outcomes, one per row; it resolved with ${describe(answer)}.`);
    result.rejected = rows.map(invalid);
    return result;
  }

  const sent = new Set(rows.map((row) => row.importKey));
  const outcomesByKey = new Map<string, Record<string, unknown>[]>();
  for (const outcome of answer) {
    const key = isObject(outcome) ? outcome.importKey : undefined;
    if (typeof key !== 'string' || !sent.has(key)) {
      result.problems.push(`saveBatch answered for an import key that was not in the batch: ${JSON.stringify(key)}.`);
      continue;
    }
    const outcomes = outcomesByKey.get(key) ?? [];
    outcomes.push(outcome as Record<string, unknown>);
    outcomesByKey.set(key, outcomes);
  }

  for (const row of rows) {
    const outcomes = outcomesByKey.get(row.importKey) ?? [];
    if (outcomes.length !== 1) {
      result.problems.push(
        outcomes.length === 0
          ? `saveBatch gave no outcome for import key ${row.importKey} (row ${row.rowIndex + 1}).`
          : `saveBatch gave ${outcomes.length} outcomes for import key ${row.importKey} (row ${row.rowIndex + 1}).`
      );
      result.rejected.push(invalid(row));
      continue;
    }

    const [outcome] = outcomes;
    if (outcome.status === 'created') {
      result.created.push(row);
    } else if (outcome.status === 'rejected') {
      const hasReason = typeof outcome.reason === 'string' && outcome.reason.trim() !== '';
      if (!hasReason) {
        result.problems.push(`saveBatch rejected import key ${row.importKey} (row ${row.rowIndex + 1}) without a reason.`);
      }
      const field = typeof outcome.field === 'string' && outcome.field !== '' ? outcome.field : undefined;
      result.rejected.push({
        ...row,
        reason: hasReason ? (outcome.reason as string) : messages.commit.noReason(),
        ...(field !== undefined && { field }),
        cause: 'host',
      });
    } else {
      result.problems.push(
        `saveBatch answered import key ${row.importKey} (row ${row.rowIndex + 1}) with status ${JSON.stringify(outcome.status)}; expected "created" or "rejected".`
      );
      result.rejected.push(invalid(row));
    }
  }

  return result;
}

export interface CommitOptions<TRecord> {
  saveBatch: SaveBatch<TRecord>;
  /** @default DEFAULT_BATCH_SIZE */
  batchSize?: number;
  /** For the reasons Data Weaver gives Rejected Rows itself; English by default */
  messages?: ResolvedMessages;
  /** Called after each batch has its outcome, before the next one is sent */
  onBatchSettled?: (result: BatchResult<TRecord>, progress: CommitProgress) => void;
  /** @default DEFAULT_RETRY */
  retry?: RetryOptions;
  /** Called when a batch failed in transit, before waiting to send it again */
  onBatchRetry?: (retry: BatchRetry) => void;
  /**
   * Once aborted, no further batch is sent and no retry is made or waited
   * for (a batch already sent still settles)
   */
  signal?: AbortSignal;
  /**
   * How to wait between attempts; must resolve early when `signal` aborts.
   * For tests: a `setTimeout` wait by default.
   */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** The jitter's random numbers in [0, 1). For tests: `Math.random` by default. */
  random?: () => number;
}

/** Every row committed, each either created or rejected, in the order sent */
export interface CommitOutcome<TRecord> {
  created: ImportRow<TRecord>[];
  rejected: RejectedRow<TRecord>[];
}

/**
 * Send rows to `saveBatch` in batches, one at a time: the next batch is sent
 * only once the previous one has its outcome.
 *
 * A batch whose promise rejects (or whose call throws) failed in transit:
 * nothing is known about it, so it is sent again, the same rows with the same
 * Import Keys, after a backoff (`retry`). A batch that was saved but whose
 * answer was lost is therefore answered `created` the second time, not saved
 * twice. After the last attempt its rows become Rejected Rows (`notSent`) and
 * the Commit carries on with the next batch.
 *
 * An answer that arrives is never retried, even when it is invalid: the Host
 * App did answer, so asking again would only repeat its adapter's bug.
 *
 * When `signal` is aborted, the Commit stops before sending another batch or
 * attempt: a batch waiting to be retried settles at once as not sent, and
 * rows of batches never sent are in neither list.
 */
export async function commitRows<TRecord>(
  rows: ImportRow<TRecord>[],
  {
    saveBatch,
    batchSize,
    messages = ENGLISH_MESSAGES,
    onBatchSettled,
    retry,
    onBatchRetry,
    signal,
    sleep = wait,
    random = Math.random,
  }: CommitOptions<TRecord>
): Promise<CommitOutcome<TRecord>> {
  const batches = toBatches(rows, normaliseBatchSize(batchSize));
  const policy = normaliseRetry(retry);
  const outcome: CommitOutcome<TRecord> = { created: [], rejected: [] };
  let done = 0;

  const send = async (batch: ImportRow<TRecord>[], number: number): Promise<BatchResult<TRecord>> => {
    for (let attempt = 1; ; attempt++) {
      let answer: unknown;
      try {
        answer = await saveBatch(batch);
      } catch (error) {
        if (attempt < policy.attempts && !signal?.aborted) {
          const delayMs = retryDelay(attempt, policy, random);
          onBatchRetry?.({ batch: number, batches: batches.length, attempt: attempt + 1, attempts: policy.attempts, delayMs, error });
          await sleep(delayMs, signal);
          if (!signal?.aborted) continue;
        }
        const reason = messages.commit.notSent({ attempts: attempt });
        return {
          created: [],
          rejected: batch.map((row) => ({ ...row, reason, cause: 'notSent' as const })),
          problems: [],
          error,
        };
      }
      return settleBatch(batch, answer, messages);
    }
  };

  for (const [index, batch] of batches.entries()) {
    if (signal?.aborted) break;
    const result = await send(batch, index + 1);

    done += batch.length;
    outcome.created.push(...result.created);
    outcome.rejected.push(...result.rejected);
    onBatchSettled?.(result, { done, total: rows.length, batch: index + 1, batches: batches.length });
  }

  return outcome;
}

const inFileOrder = <T extends ImportRow<unknown>>(rows: T[]): T[] => [...rows].sort((a, b) => a.rowIndex - b.rowIndex);

/**
 * The Import Report after a Commit. After Fix & Retry (`previous` is the
 * report it started from), it covers every outcome so far: the rows created
 * before and now, the rows still rejected (only the retry's: every earlier
 * Rejected Row was either sent again or excluded), and the rows excluded
 * before and during Fix & Retry. Every list is in file order.
 */
export function importReport<TRecord>(
  outcome: ImportReport<TRecord>,
  previous?: ImportReport<TRecord> | null
): ImportReport<TRecord> {
  return {
    created: inFileOrder([...(previous?.created ?? []), ...outcome.created]),
    rejected: inFileOrder(outcome.rejected),
    excluded: inFileOrder([...(previous?.excluded ?? []), ...outcome.excluded]),
  };
}
