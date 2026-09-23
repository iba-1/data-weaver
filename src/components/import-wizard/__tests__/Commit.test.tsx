import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { ImportWizard } from '../ImportWizard';
import type {
  FieldConfig,
  ImportReport,
  ImportRow,
  ImportWizardEvent,
  ImportWizardProps,
  RowOutcome,
} from '@/lib/import-wizard/types';
import { createFakeHostApp, type FakeHostApp } from '@/test/fakeHostApp';
import { importRows } from '@/test/wizardDriver';

vi.mock('@/lib/import-wizard/parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/import-wizard/parser')>();
  return { ...actual, parseFile: vi.fn() };
});

import { parseFile } from '@/lib/import-wizard/parser';

type Key = 'title' | 'year';
type Rec = Record<Key, unknown>;

/** The Host App's Output Shape */
const FIELDS: FieldConfig<Key>[] = [
  { key: 'title', label: 'Title', type: 'string', required: true, matchKeywords: ['title'] },
  { key: 'year', label: 'Year', type: 'number', matchKeywords: ['year'] },
];

/** A file of `count` artworks titled "Opera 1", "Opera 2", … */
function mockArtworks(count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({ Title: `Opera ${i + 1}`, Year: String(1950 + (i % 50)) }));
  vi.mocked(parseFile).mockResolvedValue({ headers: ['Title', 'Year'], rows, fileName: 'opere.csv', fileType: 'csv' });
}

function renderWizard(host: FakeHostApp<Rec>, props: Partial<ImportWizardProps<Rec, Key>> = {}) {
  return render(<ImportWizard<Rec, Key> fields={FIELDS} adapter={host.adapter} {...props} />);
}

async function goToReview() {
  const input = document.getElementById('file-input') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['x'], 'opere.csv')] } });
  });
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: /continue to validation/i }));
  });
  await screen.findByText(/validate data/i);
}

/** The grid row showing row `n` of the file (the header is aria-rowindex 1) */
function gridRow(n: number): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[aria-rowindex="${n + 1}"]`);
  if (!row) throw new Error(`Row ${n} is not rendered`);
  return row;
}

/** The counts, then each list of the Import Report as [row, title, field?, reason?] cells */
function reportTable(name: string): string[][] {
  const region = screen.getByRole('region', { name });
  return within(region)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent ?? ''));
}

const sentRowIndexes = (host: FakeHostApp<Rec>) => host.calls.flat().map((row) => row.rowIndex);

beforeEach(() => {
  vi.mocked(parseFile).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Commit through the Host App adapter', () => {
  it('saves 250 rows in 3 batches of at most 100, one batch at a time, and reports them', async () => {
    mockArtworks(250);
    const host = createFakeHostApp<Rec>();
    const onImportFinished = vi.fn<(report: ImportReport<Rec>) => void>();
    const onEvent = vi.fn<(event: ImportWizardEvent<Rec>) => void>();
    renderWizard(host, { onImportFinished, onEvent });
    await goToReview();

    await importRows();

    expect(host.calls.map((batch) => batch.length)).toEqual([100, 100, 50]);
    expect(host.maxConcurrentCalls).toBe(1);
    expect(sentRowIndexes(host)).toEqual(Array.from({ length: 250 }, (_, i) => i));
    expect(host.calls[0][0]).toEqual({
      importKey: expect.any(String),
      rowIndex: 0,
      record: { title: 'Opera 1', year: 1950 },
    });
    expect(new Set(host.calls.flat().map((row) => row.importKey)).size).toBe(250);
    expect(host.store.size).toBe(250);

    expect(screen.getByRole('heading', { name: 'Import finished' })).toBeInTheDocument();
    expect(screen.getByText('250 imported')).toBeInTheDocument();
    expect(screen.getByText('0 rejected')).toBeInTheDocument();
    expect(screen.getByText('0 excluded')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Rejected rows' })).not.toBeInTheDocument();

    expect(onImportFinished).toHaveBeenCalledTimes(1);
    const [report] = onImportFinished.mock.calls[0];
    expect(report.created).toEqual(host.calls.flat());
    expect(report.rejected).toEqual([]);
    expect(report.excluded).toEqual([]);

    const commitEvents = onEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => ['COMMIT_STARTED', 'BATCH_SETTLED', 'IMPORT_FINISHED'].includes(event.type));
    expect(commitEvents.map((event) => event.type)).toEqual([
      'COMMIT_STARTED',
      'BATCH_SETTLED',
      'BATCH_SETTLED',
      'BATCH_SETTLED',
      'IMPORT_FINISHED',
    ]);
    expect(commitEvents[0]).toEqual({ type: 'COMMIT_STARTED', rows: 250, batches: 3, excluded: 0 });
    expect(commitEvents[2]).toMatchObject({
      type: 'BATCH_SETTLED',
      progress: { done: 200, total: 250, batch: 2, batches: 3 },
    });
    expect(commitEvents[4]).toEqual({ type: 'IMPORT_FINISHED', report });
  });

  it('uses the Host App’s batch size', async () => {
    mockArtworks(5);
    const host = createFakeHostApp<Rec>();
    renderWizard(host, { batchSize: 2 });
    await goToReview();

    await importRows();

    expect(host.calls.map((batch) => batch.length)).toEqual([2, 2, 1]);
  });

  it('never sends Excluded Rows, and lists them separately in the report', async () => {
    mockArtworks(4);
    const host = createFakeHostApp<Rec>();
    const onImportFinished = vi.fn<(report: ImportReport<Rec>) => void>();
    renderWizard(host, { onImportFinished });
    await goToReview();

    fireEvent.click(within(gridRow(2)).getByRole('button', { name: 'Exclude row 2' }));
    fireEvent.click(within(gridRow(4)).getByRole('button', { name: 'Exclude row 4' }));
    await importRows();

    expect(sentRowIndexes(host)).toEqual([0, 2]);
    expect(screen.getByText('2 imported')).toBeInTheDocument();
    expect(screen.getByText('2 excluded')).toBeInTheDocument();
    expect(reportTable('Excluded rows')).toEqual([
      ['2', 'Opera 2'],
      ['4', 'Opera 4'],
    ]);
    const [report] = onImportFinished.mock.calls[0];
    expect(report.excluded.map((row) => [row.rowIndex, row.record.title])).toEqual([
      [1, 'Opera 2'],
      [3, 'Opera 4'],
    ]);
    // Excluded Rows have Import Keys too, distinct from the sent ones
    const keys = [...report.created, ...report.excluded].map((row) => row.importKey);
    expect(new Set(keys).size).toBe(4);
  });

  it('turns the Host App’s rejections into Rejected Rows with its reason and the field’s label', async () => {
    mockArtworks(3);
    const host = createFakeHostApp<Rec>({
      reject: (row) =>
        row.record.title === 'Opera 2'
          ? { reason: 'An artwork with this title already exists', field: 'title' }
          : row.record.title === 'Opera 3'
            ? { reason: 'The collection is full' }
            : null,
    });
    const onImportFinished = vi.fn<(report: ImportReport<Rec>) => void>();
    renderWizard(host, { onImportFinished });
    await goToReview();

    await importRows();

    expect(host.records()).toEqual([{ title: 'Opera 1', year: 1950 }]);
    expect(screen.getByText('1 imported')).toBeInTheDocument();
    expect(screen.getByText('2 rejected')).toBeInTheDocument();
    expect(reportTable('Rejected rows')).toEqual([
      ['2', 'Opera 2', 'Title', 'An artwork with this title already exists'],
      ['3', 'Opera 3', '', 'The collection is full'],
    ]);
    const [report] = onImportFinished.mock.calls[0];
    expect(report.rejected).toEqual([
      {
        importKey: host.calls[0][1].importKey,
        rowIndex: 1,
        record: { title: 'Opera 2', year: 1951 },
        reason: 'An artwork with this title already exists',
        field: 'title',
        cause: 'host',
      },
      {
        importKey: host.calls[0][2].importKey,
        rowIndex: 2,
        record: { title: 'Opera 3', year: 1952 },
        reason: 'The collection is full',
        cause: 'host',
      },
    ]);
  });

  it('never counts a row as imported when the Host App’s answer has no valid outcome for it', async () => {
    mockArtworks(4);
    const host = createFakeHostApp<Rec>();
    // An adapter bug: row 2's outcome is missing, row 3's is repeated, row 4's status is unknown
    host.onCall(1, {
      answer: (honest) => [honest[0], honest[2], honest[2], { ...honest[3], status: 'saved' }],
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onImportFinished = vi.fn<(report: ImportReport<Rec>) => void>();
    renderWizard(host, { onImportFinished });
    await goToReview();

    await importRows();

    expect(screen.getByText('1 imported')).toBeInTheDocument();
    expect(screen.getByText('3 rejected')).toBeInTheDocument();
    const noAnswer = 'No clear answer was received for this row, so it was not counted as imported.';
    expect(reportTable('Rejected rows')).toEqual([
      ['2', 'Opera 2', '', noAnswer],
      ['3', 'Opera 3', '', noAnswer],
      ['4', 'Opera 4', '', noAnswer],
    ]);
    const [report] = onImportFinished.mock.calls[0];
    expect(report.created.map((row) => row.rowIndex)).toEqual([0]);
    expect(report.rejected.map((row) => row.cause)).toEqual(['invalidAnswer', 'invalidAnswer', 'invalidAnswer']);
    // The Host App's developers are told what was wrong with the answer
    expect(consoleError).toHaveBeenCalledTimes(3);
    expect(consoleError.mock.calls.join('\n')).toMatch(/no outcome for import key/);
  });

  it('retries a batch whose answer was lost, telling the Importer, and saves nothing twice', async () => {
    mockArtworks(4);
    const host = createFakeHostApp<Rec>();
    const lost = new TypeError('Failed to fetch');
    // Batch 1 is saved but its answer never arrives; its retry and batch 2 are held to look at the screen
    host.onCall(1, { lose: lost });
    const retried = host.hold(2);
    const secondBatch = host.hold(3);
    const onEvent = vi.fn<(event: ImportWizardEvent<Rec>) => void>();
    const onImportFinished = vi.fn<(report: ImportReport<Rec>) => void>();
    renderWizard(host, { batchSize: 2, retry: { baseDelayMs: 0 }, onEvent, onImportFinished });
    await goToReview();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /complete import/i }));
      await retried.reached;
    });

    expect(screen.getByRole('status')).toHaveTextContent('0 of 4 rows processed');
    expect(screen.getByRole('status')).toHaveTextContent('Connection problem, retrying… (attempt 2 of 3)');
    const retries = onEvent.mock.calls.map(([event]) => event).filter((event) => event.type === 'BATCH_RETRY');
    expect(retries).toEqual([
      { type: 'BATCH_RETRY', retry: { batch: 1, batches: 2, attempt: 2, attempts: 3, delayMs: 0, error: lost } },
    ]);

    // Once the batch has its outcome, the retry notice goes
    await act(async () => {
      retried.release();
      await secondBatch.reached;
    });
    expect(screen.getByRole('status')).toHaveTextContent('2 of 4 rows processed');
    expect(screen.queryByText(/retrying/i)).not.toBeInTheDocument();

    await act(async () => secondBatch.release());
    await waitFor(() => expect(screen.getByText('4 imported')).toBeInTheDocument());
    expect(screen.getByText('0 rejected')).toBeInTheDocument();
    // The retry sent the same rows with the same Import Keys: the Host App saved each row once
    expect(host.calls[1]).toEqual(host.calls[0]);
    expect(host.store.size).toBe(4);
    expect(host.writes).toBe(4);
    expect(onImportFinished.mock.calls[0][0].created).toHaveLength(4);
  });

  it('turns a batch that could not be sent after every retry into Rejected Rows and carries on with the next batch', async () => {
    mockArtworks(5);
    const host = createFakeHostApp<Rec>();
    for (const call of [2, 3, 4]) host.onCall(call, { fail: new TypeError('Failed to fetch') });
    const onImportFinished = vi.fn<(report: ImportReport<Rec>) => void>();
    const onEvent = vi.fn<(event: ImportWizardEvent<Rec>) => void>();
    renderWizard(host, { batchSize: 2, retry: { baseDelayMs: 0 }, onImportFinished, onEvent });
    await goToReview();

    await importRows();

    expect(host.calls.map((batch) => batch.map((row) => row.rowIndex))).toEqual([[0, 1], [2, 3], [2, 3], [2, 3], [4]]);
    expect(host.records().map((record) => record.title)).toEqual(['Opera 1', 'Opera 2', 'Opera 5']);
    expect(screen.getByText('3 imported')).toBeInTheDocument();
    expect(screen.getByText('2 rejected')).toBeInTheDocument();
    const unreachable =
      'This row could not be sent: the server could not be reached, even after 3 tries. Try importing it again later.';
    expect(reportTable('Rejected rows')).toEqual([
      ['3', 'Opera 3', '', unreachable],
      ['4', 'Opera 4', '', unreachable],
    ]);
    expect(onImportFinished.mock.calls[0][0].rejected.map((row) => row.cause)).toEqual(['notSent', 'notSent']);
    const retries = onEvent.mock.calls.map(([event]) => event).filter((event) => event.type === 'BATCH_RETRY');
    expect(retries.map((event) => event.type === 'BATCH_RETRY' && [event.retry.batch, event.retry.attempt])).toEqual([
      [2, 2],
      [2, 3],
    ]);
  });

  it('shows progress while committing, with the review locked', async () => {
    mockArtworks(250);
    const host = createFakeHostApp<Rec>();
    const second = host.hold(2);
    renderWizard(host);
    await goToReview();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /complete import/i }));
      await second.reached;
    });

    const progress = screen.getByRole('progressbar', { name: 'Import progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '100');
    expect(progress).toHaveAttribute('aria-valuemax', '250');
    expect(screen.getByRole('status')).toHaveTextContent('100 of 250 rows processed');
    expect(screen.getByText('Keep this page open until the import finishes.')).toBeInTheDocument();
    // Nothing can be edited, excluded or imported again while rows are being saved
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /complete import/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to mapping/i })).not.toBeInTheDocument();

    await act(async () => second.release());
    await waitFor(() => expect(screen.getByText('250 imported')).toBeInTheDocument());
    expect(host.calls).toHaveLength(3);
  });

  it('calls saveBatch on the adapter, so a class-based adapter keeps its `this`', async () => {
    mockArtworks(2);
    class ApiAdapter {
      saved: string[] = [];
      async saveBatch(rows: ImportRow<Rec>[]): Promise<RowOutcome[]> {
        this.saved.push(...rows.map((row) => String(row.record.title)));
        return rows.map((row) => ({ importKey: row.importKey, status: 'created' }));
      }
    }
    const adapter = new ApiAdapter();
    render(<ImportWizard<Rec, Key> fields={FIELDS} adapter={adapter} />);
    await goToReview();

    await importRows();

    expect(adapter.saved).toEqual(['Opera 1', 'Opera 2']);
    expect(screen.getByText('2 imported')).toBeInTheDocument();
  });

  it('commits once even if the import button is pressed twice', async () => {
    mockArtworks(2);
    const host = createFakeHostApp<Rec>();
    renderWizard(host);
    await goToReview();

    const button = screen.getByRole('button', { name: /complete import/i });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(screen.getByText('2 imported')).toBeInTheDocument());

    expect(host.calls).toHaveLength(1);
  });

  it('keeps each row’s Import Key through edits, undo and going back to column matching', async () => {
    let made = 0;
    const randomUUID = vi.fn(() => `key-${made++}`);
    vi.stubGlobal('crypto', { randomUUID });
    mockArtworks(3);
    const host = createFakeHostApp<Rec>();
    renderWizard(host);
    await goToReview();

    // Edit row 2, undo and redo it
    fireEvent.click(screen.getByText('Opera 2'));
    const input = screen.getByDisplayValue('Opera 2');
    fireEvent.change(input, { target: { value: 'Opera seconda' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /^undo/i }));
    fireEvent.click(screen.getByRole('button', { name: /^redo/i }));
    expect(screen.getByText('Opera seconda')).toBeInTheDocument();

    // Back to column matching and on to the review again: the rows are re-validated from the file
    fireEvent.click(screen.getByRole('button', { name: /back to mapping/i }));
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /continue to validation/i }));
    });
    fireEvent.click(await screen.findByText('Opera 3'));
    const third = screen.getByDisplayValue('Opera 3');
    fireEvent.change(third, { target: { value: 'Opera terza' } });
    fireEvent.keyDown(third, { key: 'Enter' });

    await importRows();

    expect(randomUUID).toHaveBeenCalledTimes(3);
    expect(host.calls.flat().map((row) => [row.importKey, row.rowIndex, row.record.title])).toEqual([
      ['key-0', 0, 'Opera 1'],
      ['key-1', 1, 'Opera 2'],
      ['key-2', 2, 'Opera terza'],
    ]);
  });

  it('still finishes and shows the Import Report when a Host App callback throws', async () => {
    mockArtworks(150);
    const host = createFakeHostApp<Rec>();
    const onImportFinished = vi.fn();
    const hostBug = new Error('host analytics crashed');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWizard(host, {
      batchSize: 100,
      onEvent: (event) => {
        if (event.type === 'BATCH_SETTLED') throw hostBug;
      },
      onImportFinished,
    });
    await goToReview();

    await importRows();

    expect(screen.getByText('150 imported')).toBeInTheDocument();
    expect(host.calls).toHaveLength(2);
    expect(onImportFinished).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[data-weaver]'), hostBug);
  });

  it('stops sending batches once the wizard is unmounted mid-Commit', async () => {
    mockArtworks(250);
    const host = createFakeHostApp<Rec>();
    const first = host.hold(1);
    const onImportFinished = vi.fn();
    const { unmount } = renderWizard(host, { onImportFinished });
    await goToReview();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /complete import/i }));
      await first.reached;
    });
    unmount();
    await act(async () => first.release());
    // Give a would-be next batch every chance to be sent
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(host.calls).toHaveLength(1);
    expect(onImportFinished).not.toHaveBeenCalled();
  });

  it('stops retrying once the wizard is unmounted while waiting to retry', async () => {
    mockArtworks(250);
    const host = createFakeHostApp<Rec>();
    host.onCall(1, { fail: new TypeError('Failed to fetch') });
    const onEvent = vi.fn<(event: ImportWizardEvent<Rec>) => void>();
    // A wait longer than the test: only unmounting can end it
    const { unmount } = renderWizard(host, { retry: { baseDelayMs: 600_000 }, onEvent });
    await goToReview();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /complete import/i }));
    });
    await waitFor(() => expect(screen.getByText(/retrying/i)).toBeInTheDocument());
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(host.calls).toHaveLength(1);
    const types = onEvent.mock.calls.map(([event]) => event.type);
    // The wait ended at once: the batch settled as not sent, and nothing followed it
    expect(types).toContain('BATCH_SETTLED');
    expect(types).not.toContain('IMPORT_FINISHED');
  });
});

