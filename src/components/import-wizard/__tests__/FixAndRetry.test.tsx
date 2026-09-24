import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ImportWizard } from '../ImportWizard';
import type { FieldConfig, ImportReport, ImportRow, ImportWizardProps } from '@/lib/import-wizard/types';
import { createFakeHostApp, type FakeHostApp, type FakeHostAppOptions } from '@/test/fakeHostApp';
import { continueToResolution, importRows, openFixAndRetry } from '@/test/wizardDriver';

vi.mock('@/lib/import-wizard/parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/import-wizard/parser')>();
  return { ...actual, parseFile: vi.fn() };
});

import { parseFile } from '@/lib/import-wizard/parser';

type Key = 'title' | 'year';
type Rec = Record<Key, unknown>;

const FIELDS: FieldConfig<Key>[] = [
  { key: 'title', label: 'Title', type: 'string', required: true, matchKeywords: ['title'] },
  { key: 'year', label: 'Year', type: 'number', matchKeywords: ['year'] },
];

const FILE = [
  { Title: 'Achrome', Year: '1958' },
  { Title: 'Concetto spaziale', Year: '1960' },
  { Title: 'Nature morte', Year: '1955' },
  { Title: 'Linea', Year: '1959' },
];

function mockFile(rows: Record<string, unknown>[] = FILE) {
  vi.mocked(parseFile).mockResolvedValue({ headers: Object.keys(rows[0]), rows, fileName: 'opere.csv', fileType: 'csv' });
}

/**
 * A Host App that refuses "Concetto spaziale" on its title (the title is
 * taken) and, while `full.value` is true, "Nature morte" without a field
 */
function hostWithRules(options: FakeHostAppOptions<Rec> = {}) {
  const full = { value: true };
  const host = createFakeHostApp<Rec>({
    reject: (row) =>
      row.record.title === 'Concetto spaziale'
        ? { reason: 'Title already used', field: 'title' }
        : row.record.title === 'Nature morte' && full.value
          ? { reason: 'The collection is full' }
          : null,
    ...options,
  });
  return { host, full };
}

function renderWizard(host: FakeHostApp<Rec>, props: Partial<ImportWizardProps<Rec, Key>> = {}) {
  return render(<ImportWizard<Rec, Key> fields={FIELDS} adapter={host.adapter} {...props} />);
}

/** Upload the file and open the review; row 4 (Linea) is left out of the import */
async function reviewFile({ excludeLinea = true } = {}) {
  const input = document.getElementById('file-input') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['x'], 'opere.csv')] } });
  });
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: /continue to validation/i }));
  });
  await screen.findByText(/validate data/i);
  if (excludeLinea) fireEvent.click(screen.getByRole('button', { name: 'Exclude row 4' }));
}

/** The file's row numbers the grid shows, in order */
function shownRows(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent ?? '');
}

/** The grid row showing row `n` of the file */
function rowOfFile(n: number): HTMLElement {
  const row = screen.getAllByRole('row').find((r) => within(r).queryAllByRole('cell')[0]?.textContent === String(n));
  if (!row) throw new Error(`Row ${n} of the file is not shown`);
  return row;
}

/** The editable cell of a field in the grid row showing row `n` of the file (cells are in Output Shape order) */
function cellOf(n: number, field: string, fields: Pick<FieldConfig, 'key'>[] = FIELDS): HTMLElement {
  return within(rowOfFile(n)).getAllByRole('gridcell')[fields.findIndex((f) => f.key === field)];
}

function editCell(n: number, field: string, value: string, fields: Pick<FieldConfig, 'key'>[] = FIELDS) {
  fireEvent.click(cellOf(n, field, fields));
  const input = within(rowOfFile(n)).getByRole('textbox');
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

const keysOf = (rows: ImportRow<unknown>[]) => Object.fromEntries(rows.map((row) => [row.rowIndex, row.importKey]));
const rowIndexes = (rows: ImportRow<unknown>[]) => rows.map((row) => row.rowIndex);

/** Whether closing or reloading the tab now asks the Importer to confirm */
function leavingAsksToConfirm(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  vi.mocked(parseFile).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Fix & Retry', () => {
  it('shows only the Rejected Rows, fixes them and imports them on retry, with their original Import Keys', async () => {
    mockFile();
    const { host, full } = hostWithRules();
    const onImportFinished = vi.fn<(report: ImportReport<Rec>) => void>();
    renderWizard(host, { onImportFinished });
    await reviewFile();
    await importRows();
    expect(screen.getByText('1 imported')).toBeInTheDocument();
    expect(screen.getByText('2 rejected')).toBeInTheDocument();

    await openFixAndRetry();

    // Only the Rejected Rows: the imported row 1 and the excluded row 4 are hidden
    expect(screen.getByRole('heading', { name: 'Fix and retry' })).toBeInTheDocument();
    expect(shownRows()).toEqual(['2', '3']);
    expect(screen.queryByText('Achrome')).not.toBeInTheDocument();
    expect(screen.queryByText('Linea')).not.toBeInTheDocument();

    editCell(2, 'title', 'Concetto spaziale II');
    full.value = false;
    await importRows(/retry import \(2 rows\)/i);

    // Only the fixed rows were sent again, with the keys they had on the first Commit
    expect(host.calls).toHaveLength(2);
    expect(rowIndexes(host.calls[1])).toEqual([1, 2]);
    expect(keysOf(host.calls[1])).toEqual({ 1: keysOf(host.calls[0])[1], 2: keysOf(host.calls[0])[2] });
    expect(host.calls[1][0].record).toEqual({ title: 'Concetto spaziale II', year: 1960 });
    // The imported row was never sent again
    expect(host.calls.flat().filter((row) => row.rowIndex === 0)).toHaveLength(1);

    // The report now covers every outcome so far
    expect(screen.getByRole('heading', { name: 'Import finished' })).toBeInTheDocument();
    expect(screen.getByText('3 imported')).toBeInTheDocument();
    expect(screen.getByText('0 rejected')).toBeInTheDocument();
    expect(screen.getByText('1 excluded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fix and retry/i })).not.toBeInTheDocument();
    expect(host.store.size).toBe(3);

    // The Host App is told again, with the cumulative report
    expect(onImportFinished).toHaveBeenCalledTimes(2);
    const [report] = onImportFinished.mock.calls[1];
    expect(rowIndexes(report.created)).toEqual([0, 1, 2]);
    expect(report.rejected).toEqual([]);
    expect(rowIndexes(report.excluded)).toEqual([3]);
    expect(report.created[1]).toEqual(host.calls[1][0]);
  });

  it('pins each error to the offending cell, or to the whole row when the Host App gave no field', async () => {
    mockFile();
    const { host } = hostWithRules();
    renderWizard(host);
    await reviewFile();
    await importRows();

    await openFixAndRetry();

    // Row 2 was refused on its title
    expect(cellOf(2, 'title')).toHaveAttribute('aria-invalid', 'true');
    expect(cellOf(2, 'title')).toHaveAttribute('title', 'Not imported: Title already used');
    expect(cellOf(2, 'year')).not.toHaveAttribute('aria-invalid');
    expect(within(rowOfFile(2)).getByLabelText('Not imported: Title already used')).toBeInTheDocument();
    // Row 3 was refused as a whole
    expect(within(rowOfFile(3)).getByLabelText('Not imported: The collection is full')).toBeInTheDocument();
    expect(cellOf(3, 'title')).not.toHaveAttribute('aria-invalid');
    expect(cellOf(3, 'year')).not.toHaveAttribute('aria-invalid');
    // A retry needs no edit (the Host App decides again), so it is not blocked by these
    expect(screen.getByRole('button', { name: /retry import/i })).toBeEnabled();
  });

  it('re-validates edits as in the review: an invalid row blocks the retry until fixed or excluded', async () => {
    mockFile();
    const { host } = hostWithRules();
    renderWizard(host);
    await reviewFile();
    await importRows();
    await openFixAndRetry();

    editCell(2, 'title', '');
    expect(screen.getByRole('button', { name: /retry import/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Exclude row 2' }));
    expect(screen.getByRole('button', { name: /retry import \(1 row\)/i })).toBeEnabled();
  });

  it('lets the Importer exclude Rejected Rows, which then join the Excluded Rows', async () => {
    mockFile();
    const { host } = hostWithRules();
    const onImportFinished = vi.fn<(report: ImportReport<Rec>) => void>();
    renderWizard(host, { onImportFinished });
    await reviewFile();
    await importRows();
    await openFixAndRetry();

    // Give up on row 3; row 2 is sent again unchanged and refused again
    fireEvent.click(screen.getByRole('button', { name: 'Exclude row 3' }));
    await importRows(/retry import \(1 row\)/i);

    expect(rowIndexes(host.calls[1])).toEqual([1]);
    expect(screen.getByText('1 imported')).toBeInTheDocument();
    expect(screen.getByText('1 rejected')).toBeInTheDocument();
    expect(screen.getByText('2 excluded')).toBeInTheDocument();
    const [report] = onImportFinished.mock.calls[1];
    expect(rowIndexes(report.created)).toEqual([0]);
    expect(report.rejected.map((row) => [row.rowIndex, row.reason, row.field])).toEqual([[1, 'Title already used', 'title']]);
    expect(rowIndexes(report.excluded)).toEqual([2, 3]);

    // Only the row still rejected is offered again; the excluded ones stay out
    await openFixAndRetry();
    expect(shownRows()).toEqual(['2']);
  });

  it('never duplicates a row whose batch was saved but whose answer was lost', async () => {
    mockFile();
    const host = createFakeHostApp<Rec>();
    // The only attempt is saved by the Host App, but its answer never arrives
    host.onCall(1, { lose: new Error('Network timeout') });
    renderWizard(host, { retry: { attempts: 1 } });
    await reviewFile({ excludeLinea: false });
    await importRows();
    expect(screen.getByText('0 imported')).toBeInTheDocument();
    expect(screen.getByText('4 rejected')).toBeInTheDocument();

    await openFixAndRetry();
    await importRows(/retry import \(4 rows\)/i);

    expect(screen.getByText('4 imported')).toBeInTheDocument();
    expect(keysOf(host.calls[1])).toEqual(keysOf(host.calls[0]));
    // Answered "created" for keys already saved: nothing was written twice
    expect(host.store.size).toBe(4);
    expect(host.writes).toBe(4);
  });

  it('keeps warning before leaving until no Rejected Row remains', async () => {
    mockFile();
    const { host, full } = hostWithRules();
    const onLeaveWarningChange = vi.fn<(warn: boolean) => void>();
    renderWizard(host, { onLeaveWarningChange });
    await reviewFile();
    await importRows();
    expect(leavingAsksToConfirm()).toBe(true);

    await openFixAndRetry();
    expect(leavingAsksToConfirm()).toBe(true);

    // Row 3 is accepted, row 2 is still refused: the warning stays
    full.value = false;
    await importRows(/retry import/i);
    expect(screen.getByText('1 rejected')).toBeInTheDocument();
    expect(leavingAsksToConfirm()).toBe(true);

    await openFixAndRetry();
    editCell(2, 'title', 'Concetto spaziale II');
    await importRows(/retry import/i);

    expect(screen.getByText('0 rejected')).toBeInTheDocument();
    expect(leavingAsksToConfirm()).toBe(false);
    expect(onLeaveWarningChange.mock.calls).toEqual([[true], [false]]);
  });

  it('goes back to the Import Report without sending anything, keeping the edits', async () => {
    mockFile();
    const { host } = hostWithRules();
    renderWizard(host);
    await reviewFile();
    await importRows();
    await openFixAndRetry();
    editCell(2, 'title', 'Concetto spaziale II');

    fireEvent.click(screen.getByRole('button', { name: 'Back to the report' }));

    expect(screen.getByRole('heading', { name: 'Import finished' })).toBeInTheDocument();
    expect(host.calls).toHaveLength(1);
    await openFixAndRetry();
    expect(within(rowOfFile(2)).getByText('Concetto spaziale II')).toBeInTheDocument();
  });
});

describe('Fix & Retry with Relationship Fields', () => {
  type RelKey = 'title' | 'author';
  type RelRec = Record<RelKey, unknown>;
  const REL_FIELDS: FieldConfig<RelKey>[] = [
    { key: 'title', label: 'Title', type: 'string', required: true, matchKeywords: ['title'] },
    { key: 'author', label: 'Author', type: 'string', relationship: { kind: 'registry' }, matchKeywords: ['author'] },
  ];
  const REL_FILE = [
    { Title: 'Achrome', Author: 'Galleria Nuova' },
    { Title: 'Concetto spaziale', Author: 'galleria nuova' },
    { Title: 'Linea', Author: 'Lucio Fontana' },
  ];

  function relHost(options: FakeHostAppOptions<RelRec> = {}) {
    const refuse = { value: true };
    const host = createFakeHostApp<RelRec>({
      related: { registry: [{ id: 'reg-fontana', name: 'Lucio Fontana' }] },
      reject: (row) => (row.rowIndex === 1 && refuse.value ? { reason: 'Title already used', field: 'title' } : null),
      ...options,
    });
    return { host, refuse };
  }

  async function commitRelFile(host: FakeHostApp<RelRec>) {
    vi.mocked(parseFile).mockResolvedValue({ headers: ['Title', 'Author'], rows: REL_FILE, fileName: 'opere.csv', fileType: 'csv' });
    render(<ImportWizard<RelRec, RelKey> fields={REL_FIELDS} adapter={host.adapter} />);
    await reviewFile({ excludeLinea: false });
    await continueToResolution();
    await importRows();
  }

  it('reuses the Related Record created on the first Commit, never creating it again or looking it up', async () => {
    const { host, refuse } = relHost();
    await commitRelFile(host);
    expect(host.creates).toEqual([{ kind: 'registry', name: 'Galleria Nuova' }]);
    const created = host.related.get('registry')!.find((r) => r.name === 'Galleria Nuova')!.id;
    expect(screen.getByText('1 rejected')).toBeInTheDocument();

    await openFixAndRetry();
    // The grid keeps the file's text, with a badge naming the record it is now linked to
    expect(within(rowOfFile(2)).getByText('galleria nuova')).toBeInTheDocument();
    expect(within(rowOfFile(2)).getByTitle('Galleria Nuova')).toBeInTheDocument();
    refuse.value = false;
    await importRows(/retry import \(1 row\)/i);

    expect(host.creates).toHaveLength(1);
    expect(host.lookups).toHaveLength(1);
    expect(host.calls[1].map((row) => row.record)).toEqual([{ title: 'Concetto spaziale', author: created }]);
    expect(screen.getByText('3 imported')).toBeInTheDocument();
  });

  it('tries again to create a Related Record that could not be created, and sends its rows', async () => {
    let failing = true;
    const { host } = relHost({
      reject: () => null,
      failCreate: (_kind, name) => (name === 'Galleria Nuova' && failing ? 'Registry unavailable' : null),
    });
    await commitRelFile(host);
    expect(screen.getByText('2 rejected')).toBeInTheDocument();

    await openFixAndRetry();
    failing = false;
    await importRows(/retry import \(2 rows\)/i);

    expect(host.creates).toEqual([
      { kind: 'registry', name: 'Galleria Nuova' },
      { kind: 'registry', name: 'Galleria Nuova' },
    ]);
    const created = host.related.get('registry')!.find((r) => r.name === 'Galleria Nuova')!.id;
    expect(host.calls[1].map((row) => row.record.author)).toEqual([created, created]);
    expect(screen.getByText('3 imported')).toBeInTheDocument();
  });

  it('resolves only a changed name before the retry, keeping every earlier decision', async () => {
    const { host, refuse } = relHost();
    await commitRelFile(host);
    await openFixAndRetry();

    editCell(2, 'author', 'Piero Manzoni', REL_FIELDS);
    refuse.value = false;
    // A name not resolved before goes through Resolution first, alone
    await continueToResolution(/link related records \(1 row\)/i, /retry import \(1 row\)/i);
    expect(host.lookups).toEqual([
      { kind: 'registry', values: ['galleria nuova', 'lucio fontana'] },
      { kind: 'registry', values: ['piero manzoni'] },
    ]);
    const created = within(screen.getByRole('region', { name: 'Will be created (1)' })).getAllByRole('listitem');
    expect(created).toHaveLength(1);
    expect(created[0]).toHaveTextContent('Piero Manzoni');
    expect(screen.queryByText(/matched existing/i)).not.toBeInTheDocument();
    // Still Fix & Retry: the import button says the rows are imported again
    expect(screen.queryByRole('button', { name: /complete import/i })).not.toBeInTheDocument();

    await importRows(/retry import \(1 row\)/i);

    expect(host.creates.map((c) => c.name)).toEqual(['Galleria Nuova', 'Piero Manzoni']);
    const manzoni = host.related.get('registry')!.find((r) => r.name === 'Piero Manzoni')!.id;
    expect(host.calls[1].map((row) => row.record)).toEqual([{ title: 'Concetto spaziale', author: manzoni }]);
    expect(screen.getByText('3 imported')).toBeInTheDocument();
  });

  it('re-resolves only a rejected row’s renamed author; unchanged Rejected Rows keep their decisions', async () => {
    // Row 3's author is misspelt, so the Host App refuses it; row 2 is refused until the collection has room
    const refuse = { value: true };
    const host = createFakeHostApp<RelRec>({
      related: { registry: [{ id: 'reg-fontana', name: 'Lucio Fontana' }, { id: 'reg-manzoni', name: 'Piero Manzoni' }] },
      reject: (row) =>
        row.rowIndex === 1 && refuse.value
          ? { reason: 'The collection is full' }
          : row.rowIndex === 2 && row.record.author !== 'reg-manzoni'
            ? { reason: 'Not an artist of the collection', field: 'author' }
            : null,
    });
    await resolveRelFile(host, [
      { Title: 'Achrome', Author: 'Lucio Fontana' },
      { Title: 'Concetto spaziale', Author: 'Lucio Fontana' },
      { Title: 'Linea', Author: 'Piero Manzzoni' },
    ]);
    await importRows();
    expect(screen.getByText('2 rejected')).toBeInTheDocument();

    await openFixAndRetry();
    editCell(3, 'author', 'Piero Manzoni', REL_FIELDS);
    refuse.value = false;
    await continueToResolution(/link related records \(2 rows\)/i, /retry import \(2 rows\)/i);

    // Only the renamed author is looked up and shown; Lucio Fontana is not asked again
    expect(host.lookups.map((lookup) => lookup.values)).toEqual([['lucio fontana', 'piero manzzoni'], ['piero manzoni']]);
    const matched = groupItems(screen.getByRole('region', { name: 'Author' }), 'Matched existing (1)');
    expect(matched).toHaveLength(1);
    expect(matched[0]).toHaveTextContent('Piero Manzoni');
    expect(screen.queryByText('Lucio Fontana')).not.toBeInTheDocument();

    await importRows(/retry import \(2 rows\)/i);

    expect(host.calls[1].map((row) => [row.rowIndex, row.record.author])).toEqual([
      [1, 'reg-fontana'],
      [2, 'reg-manzoni'],
    ]);
    expect(host.creates.map((c) => c.name)).toEqual(['Piero Manzzoni']);
    expect(screen.getByText('3 imported')).toBeInTheDocument();
  });

  /** Upload a file with Title and Author, review it and open Resolution */
  async function resolveRelFile(host: FakeHostApp<RelRec>, file: Record<string, unknown>[]) {
    vi.mocked(parseFile).mockResolvedValue({ headers: ['Title', 'Author'], rows: file, fileName: 'opere.csv', fileType: 'csv' });
    render(<ImportWizard<RelRec, RelKey> fields={REL_FIELDS} adapter={host.adapter} />);
    await reviewFile({ excludeLinea: false });
    await continueToResolution();
  }

  /** A Host App refusing the rows at `refused` (rowIndex) on their title, until the set is emptied */
  function refusingHost(refused: Set<number>, options: FakeHostAppOptions<RelRec> = {}) {
    return createFakeHostApp<RelRec>({
      reject: (row) => (refused.has(row.rowIndex) ? { reason: 'Title already used', field: 'title' } : null),
      ...options,
    });
  }

  /** The items of one group of Resolution (e.g. "Several matches (1)") */
  function groupItems(section: HTMLElement, group: string): HTMLElement[] {
    return within(within(section).getByRole('region', { name: group })).getAllByRole('listitem');
  }

  const ROSSI = [
    { id: 'rossi-1950', name: 'Mario Rossi', description: 'b. 1950' },
    { id: 'rossi-1987', name: 'Mario Rossi', description: 'b. 1987' },
  ];
  const rossiItem = () => groupItems(screen.getByRole('region', { name: 'Author' }), 'Several matches (1)')[0];
  function chooseForRow(row: number, option: string) {
    const select = screen.getByRole('combobox', { name: `Record for Mario Rossi in row ${row}` }) as HTMLSelectElement;
    const { value } = within(select).getByRole('option', { name: option }) as HTMLOptionElement;
    fireEvent.change(select, { target: { value } });
  }

  it('keeps each row’s own Homonym decision on the retry, and never creates its new record again', async () => {
    const refused = new Set([1, 2]);
    const host = refusingHost(refused, { related: { registry: ROSSI } });
    await resolveRelFile(host, [
      { Title: 'Achrome', Author: 'Mario Rossi' },
      { Title: 'Linea', Author: 'Mario Rossi' },
      { Title: 'Bozza', Author: 'mario rossi' },
    ]);
    // The value is b. 1950; row 2 is b. 1987, row 3 a new Mario Rossi
    fireEvent.click(within(rossiItem()).getByRole('radio', { name: 'Mario Rossi (b. 1950)' }));
    fireEvent.click(within(rossiItem()).getByRole('button', { name: 'Choose for each row (3 rows)' }));
    chooseForRow(2, 'Mario Rossi (b. 1987)');
    chooseForRow(3, 'Create a new record');
    await importRows();
    const created = host.related.get('registry')!.find((r) => !String(r.id).startsWith('rossi-'))!.id;
    expect(host.calls[0].map((row) => row.record.author)).toEqual(['rossi-1950', 'rossi-1987', created]);
    expect(screen.getByText('2 rejected')).toBeInTheDocument();

    await openFixAndRetry();
    // Each row's badge says which Mario Rossi it is
    expect(within(rowOfFile(2)).getByTitle('Mario Rossi (b. 1987)')).toBeInTheDocument();
    expect(within(rowOfFile(3)).getByTitle('Mario Rossi')).toBeInTheDocument();
    refused.clear();
    await importRows(/retry import \(2 rows\)/i);

    expect(host.calls[1].map((row) => [row.rowIndex, row.record.author])).toEqual([
      [1, 'rossi-1987'],
      [2, created],
    ]);
    expect(host.creates).toHaveLength(1);
    expect(host.lookups).toHaveLength(1);
    expect(screen.getByText('3 imported')).toBeInTheDocument();
  });

  it('keeps merged values on the records they were merged into, creating nothing twice', async () => {
    const refused = new Set([1, 2]);
    const host = refusingHost(refused, {
      related: { registry: [{ id: 'reg-fontana', name: 'Lucio Fontana', description: '1899–1968' }] },
      possible: (_kind, value, record) => value === 'l. fontana' && record.name === 'Lucio Fontana',
    });
    await resolveRelFile(host, [
      { Title: 'Achrome', Author: 'Piero Manzoni' },
      { Title: 'Linea', Author: 'Manzoni, Piero' },
      { Title: 'Concetto spaziale', Author: 'L. Fontana' },
    ]);
    const possible = groupItems(screen.getByRole('region', { name: 'Author' }), 'Possibly the same (2)');
    const item = (text: string) => possible.find((p) => p.textContent?.includes(text))!;
    fireEvent.click(within(item('Manzoni, Piero')).getByRole('radio', { name: 'Merge with Piero Manzoni, also in your file' }));
    fireEvent.click(
      within(item('L. Fontana')).getByRole('radio', { name: 'Merge with Lucio Fontana (1899–1968), already in the system' })
    );
    await importRows();
    expect(host.creates.map((c) => c.name)).toEqual(['Piero Manzoni']);
    const manzoni = host.related.get('registry')!.find((r) => r.name === 'Piero Manzoni')!.id;

    await openFixAndRetry();
    refused.clear();
    await importRows(/retry import \(2 rows\)/i);

    expect(host.calls[1].map((row) => [row.rowIndex, row.record.author])).toEqual([
      [1, manzoni],
      [2, 'reg-fontana'],
    ]);
    expect(host.creates).toHaveLength(1);
    expect(host.lookups).toHaveLength(1);
  });

  it('resolves a name changed to a Homonym with the Homonym choices, kept when going back and returning', async () => {
    const refused = new Set([1]);
    const host = refusingHost(refused, { related: { registry: [{ id: 'reg-fontana', name: 'Lucio Fontana' }, ...ROSSI] } });
    await resolveRelFile(host, [
      { Title: 'Achrome', Author: 'Lucio Fontana' },
      { Title: 'Linea', Author: 'Anna Bianchi' },
    ]);
    await importRows();

    await openFixAndRetry();
    editCell(2, 'author', 'Mario Rossi', REL_FIELDS);
    refused.clear();
    await continueToResolution(/link related records \(1 row\)/i, /retry import \(1 row\)/i);

    // Only Mario Rossi, as a Homonym the Importer must decide
    expect(host.lookups.map((lookup) => lookup.values)).toEqual([['lucio fontana', 'anna bianchi'], ['mario rossi']]);
    expect(rossiItem()).toHaveTextContent('Used in 1 row');
    expect(screen.getByText('1 name needs a decision before you can import.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry import \(1 row\)/i })).toBeDisabled();
    fireEvent.click(within(rossiItem()).getByRole('radio', { name: 'Mario Rossi (b. 1987)' }));

    // Back in Fix & Retry, the badge shows the choice; returning keeps it, without looking up again
    fireEvent.click(screen.getByRole('button', { name: 'Back to Review' }));
    expect(within(rowOfFile(2)).getByTitle('Mario Rossi (b. 1987)')).toBeInTheDocument();
    await continueToResolution(/link related records \(1 row\)/i, /retry import \(1 row\)/i);
    expect(within(rossiItem()).getByRole('radio', { name: 'Mario Rossi (b. 1987)' })).toHaveAttribute('aria-checked', 'true');
    expect(host.lookups).toHaveLength(2);

    await importRows(/retry import \(1 row\)/i);
    expect(host.calls[1].map((row) => [row.rowIndex, row.record.author])).toEqual([[1, 'rossi-1987']]);
    expect(host.creates.map((c) => c.name)).toEqual(['Anna Bianchi']);
  });

  it('lets a name changed in Fix & Retry be merged with an existing record it might be', async () => {
    const refused = new Set([1]);
    const host = refusingHost(refused, {
      related: { registry: [{ id: 'reg-fontana', name: 'Lucio Fontana', description: '1899–1968' }] },
      possible: (_kind, value, record) => value === 'l. fontana' && record.name === 'Lucio Fontana',
    });
    await resolveRelFile(host, [
      { Title: 'Achrome', Author: 'Piero Manzoni' },
      { Title: 'Linea', Author: 'Anna Bianchi' },
    ]);
    await importRows();

    await openFixAndRetry();
    editCell(2, 'author', 'L. Fontana', REL_FIELDS);
    refused.clear();
    await continueToResolution(/link related records \(1 row\)/i, /retry import \(1 row\)/i);
    const [fontana] = groupItems(screen.getByRole('region', { name: 'Author' }), 'Possibly the same (1)');
    fireEvent.click(within(fontana).getByRole('radio', { name: 'Merge with Lucio Fontana (1899–1968), already in the system' }));
    await importRows(/retry import \(1 row\)/i);

    expect(host.calls[1].map((row) => [row.rowIndex, row.record.author])).toEqual([[1, 'reg-fontana']]);
    expect(host.creates.map((c) => c.name)).toEqual(['Piero Manzoni', 'Anna Bianchi']);
  });

  describe('a name typed in Fix & Retry that might be a name committed earlier', () => {
    const MERGE_WITH_ANNA = 'Merge with Anna Bianchi, from the earlier import';

    /** Commit Anna Bianchi (row 1) and Piero Manzoni (row 2, refused), then rename row 2's author to A. Bianchi */
    async function renameToInitials(host: FakeHostApp<RelRec>, refused: Set<number>, retryName: RegExp) {
      await resolveRelFile(host, [
        { Title: 'Achrome', Author: 'Anna Bianchi' },
        { Title: 'Linea', Author: 'Piero Manzoni' },
      ]);
      await importRows();
      await openFixAndRetry();
      editCell(2, 'author', 'A. Bianchi', REL_FIELDS);
      refused.clear();
      await continueToResolution(/link related records/i, retryName);
      const [item] = groupItems(screen.getByRole('region', { name: 'Author' }), 'Possibly the same (1)');
      expect(item).toHaveTextContent('A. Bianchi');
      return item;
    }

    it('is offered the committed name; merged, its row gets that record’s ID and nothing is created', async () => {
      const refused = new Set([1]);
      const host = refusingHost(refused);
      const item = await renameToInitials(host, refused, /retry import \(1 row\)/i);
      const anna = host.related.get('registry')!.find((r) => r.name === 'Anna Bianchi')!.id;

      // Kept separate until the Importer merges it
      expect(within(item).getByRole('radio', { name: 'Keep separate' })).toBeChecked();
      fireEvent.click(within(item).getByRole('radio', { name: MERGE_WITH_ANNA }));
      await importRows(/retry import \(1 row\)/i);

      expect(host.calls[1].map((row) => [row.rowIndex, row.record.author])).toEqual([[1, anna]]);
      expect(host.creates.map((c) => c.name)).toEqual(['Anna Bianchi', 'Piero Manzoni']);
      // Only the new name was looked up; Anna Bianchi was not decided again
      expect(host.lookups.map((lookup) => lookup.values)).toEqual([['anna bianchi', 'piero manzoni'], ['a. bianchi']]);
      expect(screen.getByText('2 imported')).toBeInTheDocument();
    });

    it('kept separate, is created as one new record', async () => {
      const refused = new Set([1]);
      const host = refusingHost(refused);
      await renameToInitials(host, refused, /retry import \(1 row\)/i);

      await importRows(/retry import \(1 row\)/i);

      const bianchi = host.related.get('registry')!.find((r) => r.name === 'A. Bianchi')!.id;
      expect(host.creates.map((c) => c.name)).toEqual(['Anna Bianchi', 'Piero Manzoni', 'A. Bianchi']);
      expect(host.calls[1].map((row) => [row.rowIndex, row.record.author])).toEqual([[1, bianchi]]);
    });

    it('merged with a name whose record could not be created, shares its one creation', async () => {
      let failing = true;
      const refused = new Set([1]);
      const host = refusingHost(refused, {
        failCreate: (_kind, name) => (name === 'Anna Bianchi' && failing ? 'Registry unavailable' : null),
      });
      const item = await renameToInitials(host, refused, /retry import \(2 rows\)/i);
      fireEvent.click(within(item).getByRole('radio', { name: MERGE_WITH_ANNA }));
      failing = false;
      await importRows(/retry import \(2 rows\)/i);

      // Anna Bianchi is created once on the retry, for both rows
      expect(host.creates.map((c) => c.name)).toEqual(['Anna Bianchi', 'Piero Manzoni', 'Anna Bianchi']);
      const anna = host.related.get('registry')!.find((r) => r.name === 'Anna Bianchi')!.id;
      expect(host.calls[1].map((row) => [row.rowIndex, row.record.author])).toEqual([
        [0, anna],
        [1, anna],
      ]);
      expect(screen.getByText('2 imported')).toBeInTheDocument();
    });
  });
});
