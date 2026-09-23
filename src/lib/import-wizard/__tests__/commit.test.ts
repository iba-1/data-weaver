import { describe, it, expect, vi } from 'vitest';
import {
  commitRows,
  createImportKey,
  createImportKeys,
  DEFAULT_BATCH_SIZE,
  normaliseBatchSize,
  settleBatch,
  toBatches,
  type BatchResult,
} from '../commit';
import { resolveMessages } from '../messages';
import type { CommitProgress, ImportRow } from '../types';
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

  it('turns a batch whose promise rejects into Rejected Rows and carries on with the next batch', async () => {
    const host = createFakeHostApp<Rec>();
    const network = new TypeError('Failed to fetch');
    host.onCall(2, { fail: network });
    const results: BatchResult<Rec>[] = [];

    const outcome = await commitRows(rows(5), {
      saveBatch: host.adapter.saveBatch,
      batchSize: 2,
      onBatchSettled: (result) => results.push(result),
    });

    expect(host.calls).toHaveLength(3);
    expect(outcome.created.map((r) => r.rowIndex)).toEqual([0, 1, 4]);
    expect(outcome.rejected).toEqual([
      { ...rows(5)[2], reason: 'This row could not be sent. Try importing it again later.', cause: 'notSent' },
      { ...rows(5)[3], reason: 'This row could not be sent. Try importing it again later.', cause: 'notSent' },
    ]);
    expect(results[1].error).toBe(network);
  });

  it('treats a saveBatch that throws instead of rejecting the same way', async () => {
    const outcome = await commitRows(rows(2), {
      saveBatch: () => {
        throw new Error('adapter bug');
      },
    });
    expect(outcome.created).toEqual([]);
    expect(outcome.rejected.map((r) => r.cause)).toEqual(['notSent', 'notSent']);
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
