import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ImportWizard } from '../ImportWizard';
import type { FieldConfig, ImportWizardProps } from '@/lib/import-wizard/types';
import { createFakeHostApp, type FakeHostApp } from '@/test/fakeHostApp';
import { continueToResolution, importRows } from '@/test/wizardDriver';
import { readSheet } from '@/test/spreadsheet';

vi.mock('@/lib/import-wizard/parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/import-wizard/parser')>();
  return { ...actual, parseFile: vi.fn() };
});

import { parseFile } from '@/lib/import-wizard/parser';

type Key = 'title' | 'year';
type Rec = Record<Key, unknown>;

const FIELDS: FieldConfig<Key>[] = [
  { key: 'title', label: 'Title', type: 'string', required: true, matchKeywords: ['titolo'] },
  { key: 'year', label: 'Year', type: 'number', matchKeywords: ['anno'] },
];

/** The Importer's file: its own headers, and a "Scaffale" column that is not imported */
const FILE_ROWS = [
  { Titolo: 'Achrome', Anno: '1,958', Scaffale: 'A-01' },
  { Titolo: 'Concetto spaziale', Anno: '1960', Scaffale: '007' },
  { Titolo: 'Nature morte', Anno: '1955', Scaffale: 'C-03' },
];

function mockFile(rows = FILE_ROWS, fileName = 'opere.xlsx') {
  vi.mocked(parseFile).mockResolvedValue({ headers: Object.keys(rows[0]), rows, fileName, fileType: 'excel' });
}

/** A Host App that refuses rows 2 and 3 of the file */
function hostRejectingRows2And3(): FakeHostApp<Rec> {
  return createFakeHostApp<Rec>({
    reject: (row) =>
      row.rowIndex === 1
        ? { reason: 'Already in the collection', field: 'title' }
        : row.rowIndex === 2
          ? { reason: 'The collection is full' }
          : null,
  });
}

function renderWizard(host: FakeHostApp<Rec>, props: Partial<ImportWizardProps<Rec, Key>> = {}) {
  return render(<ImportWizard<Rec, Key> fields={FIELDS} adapter={host.adapter} {...props} />);
}

async function goToReview() {
  const input = document.getElementById('file-input') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['x'], 'opere.xlsx')] } });
  });
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: /continue to validation/i }));
  });
  await screen.findByText(/validate data/i);
}

function editCell(text: string, value: string) {
  fireEvent.click(screen.getByText(text));
  const input = screen.getByDisplayValue(text);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

/** Files the wizard hands the browser to download */
let downloads: { fileName: string; blob: Blob }[];

beforeEach(() => {
  vi.mocked(parseFile).mockReset();
  downloads = [];
  const blobs = new Map<string, Blob>();
  // jsdom has no object URLs and does not download
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:test/${blobs.size}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const blob = blobs.get(this.href);
    if (blob) downloads.push({ fileName: this.download, blob });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Whether closing or reloading the tab now asks the Importer to confirm */
function leavingAsksToConfirm(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('downloading the Rejected Rows', () => {
  it('downloads the file’s own columns, with the Importer’s edits, and the error, as Excel', async () => {
    mockFile();
    const host = hostRejectingRows2And3();
    renderWizard(host);
    await goToReview();
    // Row 3 is edited in review before the import; row 2 is not
    editCell('Nature morte', 'Natura morta');

    await importRows();
    expect(screen.getByText('2 rejected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download rejected rows' }));

    expect(downloads).toHaveLength(1);
    const [{ fileName, blob }] = downloads;
    expect(fileName).toBe('opere - rejected rows.xlsx');
    expect(await readSheet(blob)).toEqual({
      sheetName: 'Rejected rows',
      rows: [
        ['Titolo', 'Anno', 'Scaffale', 'Error'],
        ['Concetto spaziale', '1960', '007', 'Title: Already in the collection'],
        ['Natura morta', '1955', 'C-03', 'The collection is full'],
      ],
    });
    // The object URL is released once the download has started
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/0'));
  });

  it('downloads CSV when the Host App accepts only CSV uploads, so the file can be imported again', async () => {
    mockFile(FILE_ROWS, 'opere.csv');
    renderWizard(hostRejectingRows2And3(), { acceptedFileTypes: ['.csv'] });
    const input = document.getElementById('file-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'opere.csv')] } });
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /continue to validation/i }));
    });
    await screen.findByText(/validate data/i);

    await importRows();
    fireEvent.click(screen.getByRole('button', { name: 'Download rejected rows' }));

    expect(downloads.map((d) => [d.fileName, d.blob.type])).toEqual([
      ['opere - rejected rows.csv', 'text/csv;charset=utf-8'],
    ]);
  });

  it('is not offered when no row was rejected', async () => {
    mockFile();
    renderWizard(createFakeHostApp<Rec>());
    await goToReview();

    await importRows();

    expect(screen.getByText('3 imported')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download rejected rows' })).not.toBeInTheDocument();
  });
});

describe('leaving with unfixed Rejected Rows', () => {
  it('asks to confirm closing or reloading the tab only while the Import Report shows Rejected Rows', async () => {
    mockFile();
    const { unmount } = renderWizard(hostRejectingRows2And3());
    expect(leavingAsksToConfirm()).toBe(false);
    await goToReview();
    expect(leavingAsksToConfirm()).toBe(false);

    await importRows();

    expect(screen.getByText('2 rejected')).toBeInTheDocument();
    expect(leavingAsksToConfirm()).toBe(true);
    unmount();
    expect(leavingAsksToConfirm()).toBe(false);
  });

  it('does not ask when no row was rejected', async () => {
    mockFile();
    renderWizard(createFakeHostApp<Rec>());
    await goToReview();

    await importRows();

    expect(screen.getByText('3 imported')).toBeInTheDocument();
    expect(leavingAsksToConfirm()).toBe(false);
  });

  it('tells the Host App when leaving should be confirmed, so it can guard its own navigation', async () => {
    mockFile();
    const onLeaveWarningChange = vi.fn<(warn: boolean) => void>();
    const { unmount } = renderWizard(hostRejectingRows2And3(), { onLeaveWarningChange });
    await goToReview();
    expect(onLeaveWarningChange).not.toHaveBeenCalled();

    await importRows();
    expect(onLeaveWarningChange.mock.calls).toEqual([[true]]);

    // Once the Importer has left (the Host App let the navigation through), the guard is lifted
    unmount();
    expect(onLeaveWarningChange.mock.calls).toEqual([[true], [false]]);
  });

  it('never tells the Host App to guard navigation when no row was rejected', async () => {
    mockFile();
    const onLeaveWarningChange = vi.fn<(warn: boolean) => void>();
    const { unmount } = renderWizard(createFakeHostApp<Rec>(), { onLeaveWarningChange });
    await goToReview();

    await importRows();
    unmount();

    expect(onLeaveWarningChange).not.toHaveBeenCalled();
  });
});

describe('Rejected Rows with Relationship Fields', () => {
  type RelKey = 'title' | 'author';
  type RelRec = Record<RelKey, unknown>;
  const REL_FIELDS: FieldConfig<RelKey>[] = [
    { key: 'title', label: 'Title', type: 'string', required: true, matchKeywords: ['titolo'] },
    { key: 'author', label: 'Author', type: 'string', relationship: { kind: 'registry' }, matchKeywords: ['autore'] },
  ];

  it('shows and downloads the Importer’s own text, never the Related Record IDs that were sent', async () => {
    const rows = [
      { Titolo: 'Achrome', Autore: 'Piero Manzoni' },
      { Titolo: 'Concetto spaziale', Autore: 'lucio  fontana' },
    ];
    vi.mocked(parseFile).mockResolvedValue({ headers: ['Titolo', 'Autore'], rows, fileName: 'opere.xlsx', fileType: 'excel' });
    const host = createFakeHostApp<RelRec>({
      related: { registry: [{ id: 'reg-fontana', name: 'Lucio Fontana' }] },
      reject: (row) => (row.rowIndex === 1 ? { reason: 'Already in the collection' } : null),
    });
    const onImportFinished = vi.fn();
    render(<ImportWizard<RelRec, RelKey> fields={REL_FIELDS} adapter={host.adapter} onImportFinished={onImportFinished} />);
    await goToReview();
    await continueToResolution();

    await importRows();

    // The Host App got what was saved: the Related Record's ID
    expect(onImportFinished.mock.calls[0][0].rejected[0].record.author).toBe('reg-fontana');
    // The Importer sees and downloads what their file said
    expect(screen.queryByText('reg-fontana')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download rejected rows' }));
    const { rows: sheet } = await readSheet(downloads[0].blob);
    expect(sheet).toEqual([
      ['Titolo', 'Autore', 'Error'],
      ['Concetto spaziale', 'lucio  fontana', 'Already in the collection'],
    ]);
  });
});

