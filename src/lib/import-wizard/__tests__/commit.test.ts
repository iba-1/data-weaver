import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  commitRows,
  createImportKey,
  createImportKeys,
  DEFAULT_BATCH_SIZE,
  DEFAULT_RETRY,
  normaliseBatchSize,
  normaliseRetry,
  retryDelay,
  settleBatch,
  toBatches,
  type BatchResult,
} from '../commit';
import { resolveMessages } from '../messages';
import type { BatchRetry, CommitProgress, ImportRow } from '../types';
import { createFakeHostApp } from '@/test/fakeHostApp';

type Rec = { title: string };

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function rows(count: number): ImportRow<Rec>[] {
  return Array.from({ length: count }, (_, rowIndex) => ({
    importKey: `key-${rowIndex}`,
    rowIndex,
    record: { title: `Opera ${rowIndex + 1}` },
  }));
}

describe('Import Keys', () => {
  it('uses crypto.randomUUID when the page has it', () => {
    expect(createImportKey({ randomUUID: () => '11111111-2222-4333-8444-555555555555' })).toBe(
      '11111111-2222-4333-8444-555555555555'
    );
  });

  it('builds a version 4 UUID from getRandomValues where randomUUID is missing (insecure contexts)', () => {
    const getRandomValues = vi.fn(<T extends ArrayBufferView | null>(array: T) => {
      (array as unknown as Uint8Array).fill(0xff);
      return array;
    });
    const key = createImportKey({ getRandomValues } as Pick<Crypto, 'getRandomValues'>);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(key).toMatch(UUID_V4);
    expect(key).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('still makes version 4 UUIDs without Web Crypto at all', () => {
    const keys = createImportKeys(1000, {});
    expect(keys.every((key) => UUID_V4.test(key))).toBe(true);
    expect(new Set(keys).size).toBe(1000);
  });

  it('makes one unique key per row with the environment’s crypto', () => {
    const keys = createImportKeys(10_000);
    expect(keys).toHaveLength(10_000);
    expect(new Set(keys).size).toBe(10_000);
    expect(keys.every((key) => UUID_V4.test(key))).toBe(true);
  });
});

describe('batching', () => {
  it('splits rows into consecutive batches of at most the batch size', () => {
    expect(toBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(toBatches([], 100)).toEqual([]);
    expect(toBatches(rows(250), 100).map((b) => b.length)).toEqual([100, 100, 50]);
  });

  it('falls back to the default for batch sizes that are not a whole number of at least 1', () => {
    expect(DEFAULT_BATCH_SIZE).toBe(100);
    expect(normaliseBatchSize(undefined)).toBe(100);
    expect(normaliseBatchSize(0)).toBe(100);
    expect(normaliseBatchSize(-5)).toBe(100);
    expect(normaliseBatchSize(NaN)).toBe(100);
    expect(normaliseBatchSize(Infinity)).toBe(100);
    expect(normaliseBatchSize(2.9)).toBe(2);
    expect(normaliseBatchSize(1)).toBe(1);
  });
});

describe('settleBatch: checking the Host App’s answer', () => {
  const sent = rows(3);

  it('takes one outcome per row, in any order, with the Host App’s reason and field', () => {
    const result = settleBatch(sent, [
      { importKey: 'key-2', status: 'created' },
      { importKey: 'key-0', status: 'rejected', reason: 'Titolo già presente', field: 'title' },
      { importKey: 'key-1', status: 'created' },
    ]);

    expect(result.created.map((r) => r.rowIndex)).toEqual([1, 2]);
    expect(result.rejected).toEqual([
      { ...sent[0], reason: 'Titolo già presente', field: 'title', cause: 'host' },
    ]);
    expect(result.problems).toEqual([]);
  });

  it('never counts a row as created without exactly one valid outcome for it', () => {
    const result = settleBatch(sent, [
      { importKey: 'key-0', status: 'created' },
      { importKey: 'key-0', status: 'created' }, // repeated
      { importKey: 'key-1', status: 'updated' }, // not a status
      // key-2: missing
      { importKey: 'key-99', status: 'created' }, // not sent
      null,
    ]);

    expect(result.created).toEqual([]);
    expect(result.rejected.map((r) => [r.rowIndex, r.cause])).toEqual([
      [0, 'invalidAnswer'],
      [1, 'invalidAnswer'],
      [2, 'invalidAnswer'],
    ]);
    expect(result.rejected[0].reason).toBe(
      'No clear answer was received for this row, so it was not counted as imported.'
    );
    expect(result.problems).toHaveLength(5);
    expect(result.problems.join('\n')).toMatch(/2 outcomes for import key key-0/);
    expect(result.problems.join('\n')).toMatch(/"updated"/);
    expect(result.problems.join('\n')).toMatch(/no outcome for import key key-2/);
    expect(result.problems.join('\n')).toMatch(/not in the batch: "key-99"/);
  });

  it('rejects every row when the answer is not a list', () => {
    for (const answer of [undefined, null, { created: 3 }, 'ok']) {
      const result = settleBatch(sent, answer);
      expect(result.created).toEqual([]);
      expect(result.rejected.map((r) => r.cause)).toEqual(['invalidAnswer', 'invalidAnswer', 'invalidAnswer']);
      expect(result.problems[0]).toMatch(/must resolve with an array/);
    }
  });

  it('gives a rejection without a reason the catalogue’s reason, in the catalogue’s language', () => {
    const italian = resolveMessages({ commit: { noReason: 'Rifiutata senza motivo.' } });
    const result = settleBatch(
      sent.slice(0, 1),
      [{ importKey: 'key-0', status: 'rejected', reason: '  ', field: 42 }],
      italian
    );

    expect(result.rejected).toEqual([{ ...sent[0], reason: 'Rifiutata senza motivo.', cause: 'host' }]);
    expect(result.problems[0]).toMatch(/without a reason/);
  });
});

describe('commitRows', () => {
  it('sends no further batch once its signal is aborted', async () => {
    const host = createFakeHostApp<Rec>();
    const abort = new AbortController();

    const outcome = await commitRows(rows(250), {
      saveBatch: host.adapter.saveBatch,
      signal: abort.signal,
      onBatchSettled: () => abort.abort(),
    });

    expect(host.calls).toHaveLength(1);
    expect(outcome.created).toHaveLength(100);
    expect(outcome.rejected).toHaveLength(0);
  });

  it('sends 250 rows as 3 batches of at most 100, one at a time, in file order', async () => {
    const host = createFakeHostApp<Rec>();
    const progress: CommitProgress[] = [];

    const outcome = await commitRows(rows(250), {
      saveBatch: host.adapter.saveBatch,
      onBatchSettled: (_, p) => progress.push(p),
    });

    expect(host.calls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(host.calls.flat().map((r) => r.rowIndex)).toEqual(Array.from({ length: 250 }, (_, i) => i));
    expect(host.maxConcurrentCalls).toBe(1);
    expect(outcome.created).toHaveLength(250);
    expect(outcome.rejected).toEqual([]);
    expect(progress).toEqual([
      { done: 100, total: 250, batch: 1, batches: 3 },
      { done: 200, total: 250, batch: 2, batches: 3 },
      { done: 250, total: 250, batch: 3, batches: 3 },
    ]);
  });

  it('uses the batch size given', async () => {
    const host = createFakeHostApp<Rec>();
    await commitRows(rows(5), { saveBatch: host.adapter.saveBatch, batchSize: 2 });
    expect(host.calls.map((c) => c.length)).toEqual([2, 2, 1]);
  });

  it('reports the Host App’s rejections per row and does not save a row twice when sent again', async () => {
    const host = createFakeHostApp<Rec>({
      reject: (row) => (row.record.title === 'Opera 2' ? { reason: 'Titolo già presente', field: 'title' } : null),
    });

    const first = await commitRows(rows(3), { saveBatch: host.adapter.saveBatch });
    expect(first.created.map((r) => r.rowIndex)).toEqual([0, 2]);
    expect(first.rejected).toEqual([{ ...rows(3)[1], reason: 'Titolo già presente', field: 'title', cause: 'host' }]);

    // The same keys again: the Host App recognises them and saves nothing new
    const again = await commitRows([rows(3)[0], rows(3)[2]], { saveBatch: host.adapter.saveBatch });
    expect(again.created.map((r) => r.rowIndex)).toEqual([0, 2]);
    expect(host.store.size).toBe(2);
    expect(host.writes).toBe(2);
  });

  it('commits nothing, and calls nothing, when there are no rows', async () => {
    const saveBatch = vi.fn();
    expect(await commitRows([], { saveBatch })).toEqual({ created: [], rejected: [] });
    expect(saveBatch).not.toHaveBeenCalled();
  });
});

describe('commitRows: retrying a batch that fails in transit', () => {
  const unreachable = (attempts: number) =>
    `This row could not be sent: the server could not be reached, even after ${attempts} tries. Try importing it again later.`;

  /** A sleep that returns at once and remembers how long it was asked to wait */
  function instantSleep() {
    const waits: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      waits.push(ms);
    });
    return { sleep, waits };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a batch whose promise rejects, and counts it once it succeeds', async () => {
    const host = createFakeHostApp<Rec>();
    const network = new TypeError('Failed to fetch');
    host.onCall(1, { fail: network });
    const { sleep, waits } = instantSleep();
    const retries: BatchRetry[] = [];
    const settled: BatchResult<Rec>[] = [];

    const outcome = await commitRows(rows(3), {
      saveBatch: host.adapter.saveBatch,
      batchSize: 2,
      sleep,
      random: () => 1,
      onBatchRetry: (retry) => retries.push(retry),
      onBatchSettled: (result) => settled.push(result),
    });

    expect(host.calls.map((call) => call.map((row) => row.rowIndex))).toEqual([[0, 1], [0, 1], [2]]);
    expect(outcome.created.map((row) => row.rowIndex)).toEqual([0, 1, 2]);
    expect(outcome.rejected).toEqual([]);
    expect(waits).toEqual([1000]);
    expect(retries).toEqual([{ batch: 1, batches: 2, attempt: 2, attempts: 3, delayMs: 1000, error: network }]);
    // A batch that eventually succeeded settles once, with no error
    expect(settled).toHaveLength(2);
    expect(settled[0].error).toBeUndefined();
  });

  it('resends the same rows with the same Import Keys, so a batch saved but whose answer was lost is not saved twice', async () => {
    const host = createFakeHostApp<Rec>();
    host.onCall(1, { lose: new Error('Connection reset') });
    const { sleep } = instantSleep();

    const outcome = await commitRows(rows(4), { saveBatch: host.adapter.saveBatch, sleep });

    expect(host.calls).toHaveLength(2);
    expect(host.calls[1]).toEqual(host.calls[0]);
    expect(outcome.created.map((row) => row.rowIndex)).toEqual([0, 1, 2, 3]);
    expect(host.store.size).toBe(4);
    expect(host.writes).toBe(4);
  });

  it('gives up after the last attempt: the rows become Rejected Rows and the next batch is sent', async () => {
    const host = createFakeHostApp<Rec>();
    const errors = [new Error('503'), new Error('504'), new TypeError('Failed to fetch')];
    errors.forEach((fail, i) => host.onCall(i + 1, { fail }));
    const { sleep, waits } = instantSleep();
    const settled: BatchResult<Rec>[] = [];
    const progress: CommitProgress[] = [];

    const outcome = await commitRows(rows(3), {
      saveBatch: host.adapter.saveBatch,
      batchSize: 2,
      sleep,
      random: () => 1,
      onBatchSettled: (result, p) => {
        settled.push(result);
        progress.push(p);
      },
    });

    expect(host.calls.map((call) => call.map((row) => row.rowIndex))).toEqual([[0, 1], [0, 1], [0, 1], [2]]);
    expect(waits).toEqual([1000, 2000]);
    expect(outcome.created.map((row) => row.rowIndex)).toEqual([2]);
    expect(outcome.rejected).toEqual([
      { ...rows(3)[0], reason: unreachable(3), cause: 'notSent' },
      { ...rows(3)[1], reason: unreachable(3), cause: 'notSent' },
    ]);
    expect(settled[0].error).toBe(errors[2]);
    expect(progress.map((p) => p.done)).toEqual([2, 3]);
    expect(host.store.size).toBe(1);
  });

  it('treats a saveBatch that throws instead of rejecting the same way', async () => {
    const saveBatch = vi.fn(() => {
      throw new Error('adapter bug');
    });
    const outcome = await commitRows(rows(2), { saveBatch, sleep: instantSleep().sleep });

    expect(saveBatch).toHaveBeenCalledTimes(3);
    expect(outcome.created).toEqual([]);
    expect(outcome.rejected.map((r) => [r.cause, r.reason])).toEqual([
      ['notSent', unreachable(3)],
      ['notSent', unreachable(3)],
    ]);
  });

  it('does not retry an answer that arrived but is invalid: the Host App answered, so sending again would not fix it', async () => {
    const host = createFakeHostApp<Rec>();
    host.onCall(1, { answer: () => ({ ok: true }) });
    const { sleep } = instantSleep();
    const onBatchRetry = vi.fn();

    const outcome = await commitRows(rows(2), { saveBatch: host.adapter.saveBatch, sleep, onBatchRetry });

    expect(host.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(onBatchRetry).not.toHaveBeenCalled();
    expect(outcome.rejected.map((row) => row.cause)).toEqual(['invalidAnswer', 'invalidAnswer']);
  });

  it('does not retry the Host App’s rejections', async () => {
    const host = createFakeHostApp<Rec>({ reject: () => ({ reason: 'Titolo già presente' }) });
    const { sleep } = instantSleep();

    const outcome = await commitRows(rows(2), { saveBatch: host.adapter.saveBatch, sleep });

    expect(host.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(outcome.rejected.map((row) => row.cause)).toEqual(['host', 'host']);
  });

  it('uses the attempts and delays given; one attempt turns retrying off', async () => {
    const always = vi.fn(async () => {
      throw new Error('offline');
    });

    const { sleep, waits } = instantSleep();
    await commitRows(rows(1), {
      saveBatch: always,
      sleep,
      random: () => 1,
      retry: { attempts: 5, baseDelayMs: 100, maxDelayMs: 300 },
    });
    expect(always).toHaveBeenCalledTimes(5);
    expect(waits).toEqual([100, 200, 300, 300]);

    always.mockClear();
    const once = instantSleep();
    const outcome = await commitRows(rows(1), { saveBatch: always, sleep: once.sleep, retry: { attempts: 1 } });
    expect(always).toHaveBeenCalledTimes(1);
    expect(once.sleep).not.toHaveBeenCalled();
    expect(outcome.rejected[0].reason).toBe(
      'This row could not be sent: the server could not be reached. Try importing it again later.'
    );
  });

  it('gives the unreachable reason in the catalogue’s language', async () => {
    const italian = resolveMessages({ commit: { notSent: 'Server irraggiungibile dopo {attempts} tentativi.' } });
    const outcome = await commitRows(rows(1), {
      saveBatch: async () => {
        throw new Error('offline');
      },
      sleep: instantSleep().sleep,
      messages: italian,
    });
    expect(outcome.rejected[0].reason).toBe('Server irraggiungibile dopo 3 tentativi.');
  });

  it('waits the backoff on real timers before each retry', async () => {
    vi.useFakeTimers();
    const host = createFakeHostApp<Rec>();
    host.onCall(1, { fail: new Error('offline') });
    host.onCall(2, { fail: new Error('offline') });

    const committing = commitRows(rows(1), { saveBatch: host.adapter.saveBatch, random: () => 0 });

    await vi.advanceTimersByTimeAsync(0);
    expect(host.calls).toHaveLength(1);
    // First retry after 500-1000 ms (random 0: 500)
    await vi.advanceTimersByTimeAsync(499);
    expect(host.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(host.calls).toHaveLength(2);
    // Second retry after 1000-2000 ms (random 0: 1000)
    await vi.advanceTimersByTimeAsync(999);
    expect(host.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(host.calls).toHaveLength(3);

    const outcome = await committing;
    expect(outcome.created).toHaveLength(1);
  });

  it('stops waiting and retrying once aborted: the waiting batch becomes Rejected Rows and no batch is sent after it', async () => {
    const host = createFakeHostApp<Rec>();
    host.onCall(1, { fail: new Error('offline') });
    const abort = new AbortController();
    const settled = vi.fn();
    const started = Date.now();

    const outcome = await commitRows(rows(3), {
      saveBatch: host.adapter.saveBatch,
      batchSize: 2,
      signal: abort.signal,
      // A wait far longer than the test's timeout: only the abort can end it
      retry: { baseDelayMs: 600_000, maxDelayMs: 600_000 },
      onBatchRetry: () => abort.abort(),
      onBatchSettled: settled,
    });

    expect(Date.now() - started).toBeLessThan(10_000);
    expect(host.calls).toHaveLength(1);
    expect(outcome.created).toEqual([]);
    expect(outcome.rejected.map((row) => [row.rowIndex, row.cause])).toEqual([
      [0, 'notSent'],
      [1, 'notSent'],
    ]);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('makes no retry once aborted while an attempt was on its way', async () => {
    const host = createFakeHostApp<Rec>();
    host.onCall(1, { fail: new Error('offline') });
    host.onCall(2, { fail: new Error('offline') });
    const abort = new AbortController();
    const second = host.hold(2);
    const { sleep } = instantSleep();

    const committing = commitRows(rows(2), { saveBatch: host.adapter.saveBatch, signal: abort.signal, sleep });
    await second.reached;
    abort.abort();
    second.release();
    const outcome = await committing;

    expect(host.calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(outcome.rejected.map((row) => row.cause)).toEqual(['notSent', 'notSent']);
  });
});

describe('retry policy', () => {
  it('defaults to 3 attempts, 1 s before the first retry, doubling, at most 8 s', () => {
    expect(DEFAULT_RETRY).toEqual({ attempts: 3, baseDelayMs: 1000, maxDelayMs: 8000 });
    expect(normaliseRetry(undefined)).toEqual(DEFAULT_RETRY);
    expect(normaliseRetry({ attempts: 5 })).toEqual({ ...DEFAULT_RETRY, attempts: 5 });
  });

  it('falls back to the default for values that make no sense', () => {
    expect(normaliseRetry({ attempts: 0, baseDelayMs: -1, maxDelayMs: NaN })).toEqual(DEFAULT_RETRY);
    expect(normaliseRetry({ attempts: Infinity })).toEqual(DEFAULT_RETRY);
    expect(normaliseRetry({ attempts: 2.7, baseDelayMs: 0 })).toEqual({ ...DEFAULT_RETRY, attempts: 2, baseDelayMs: 0 });
    // The longest wait is never shorter than the first
    expect(normaliseRetry({ baseDelayMs: 5000, maxDelayMs: 100 })).toEqual({
      ...DEFAULT_RETRY,
      baseDelayMs: 5000,
      maxDelayMs: 5000,
    });
  });

  it('backs off exponentially, capped, with jitter between half and all of the wait', () => {
    const policy = normaliseRetry({ baseDelayMs: 1000, maxDelayMs: 3000 });
    expect([1, 2, 3, 4].map((retry) => retryDelay(retry, policy, () => 1))).toEqual([1000, 2000, 3000, 3000]);
    expect([1, 2, 3, 4].map((retry) => retryDelay(retry, policy, () => 0))).toEqual([500, 1000, 1500, 1500]);
    expect(retryDelay(2, policy, () => 0.5)).toBe(1500);
    expect(retryDelay(1, normaliseRetry({ baseDelayMs: 0 }), () => 1)).toBe(0);
  });
});
