import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ImportWizard } from '../ImportWizard';
import { createFakeHostApp } from '@/test/fakeHostApp';
import { importRows } from '@/test/wizardDriver';
import { DataValidator } from '../DataValidator';
import type { FieldConfig, RowCompleteEvent, RowValidation } from '@/lib/import-wizard/types';

vi.mock('@/lib/import-wizard/parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/import-wizard/parser')>();
  return { ...actual, parseFile: vi.fn() };
});

import { parseFile } from '@/lib/import-wizard/parser';

type Key = 'name' | 'email';
type Rec = Record<Key, unknown>;

const FIELDS: FieldConfig<Key>[] = [
  { key: 'name', label: 'Name', type: 'string', required: true, matchKeywords: ['name'] },
  { key: 'email', label: 'Email', type: 'string', matchKeywords: ['email'] },
];

function mockFile(rows: Record<string, unknown>[]) {
  vi.mocked(parseFile).mockResolvedValue({
    headers: Object.keys(rows[0]),
    rows,
    fileName: 'people.csv',
    fileType: 'csv',
  });
}

/** Upload a file and continue past column mapping to the review step. */
async function goToReview() {
  const input = document.getElementById('file-input') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['x'], 'people.csv', { type: 'text/csv' })] } });
  });
  fireEvent.click(await screen.findByRole('button', { name: /continue to validation/i }));
  await screen.findByText(/validate data/i);
}

function rowFor(label: string) {
  return screen.getByText(label).closest('tr') as HTMLElement;
}

beforeEach(() => {
  vi.mocked(parseFile).mockReset();
});

describe('ImportWizard', () => {
  it('renders without the Host App providing a TooltipProvider or any backend config', async () => {
    mockFile([{ name: 'Ada', email: '' }]);
    render(<ImportWizard adapter={createFakeHostApp().adapter} fields={FIELDS} />);

    await goToReview();

    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('reports each row once to onRowComplete, even when the Host App re-renders on every event', async () => {
    mockFile([
      { name: 'Ada', email: 'a@x.io' },
      { name: 'Grace', email: 'g@x.io' },
    ]);
    const received: RowCompleteEvent<Rec>[] = [];

    function Host() {
      const [count, setCount] = useState(0);
      return (
        <>
          <span data-testid="count">{count}</span>
          <ImportWizard<Rec, Key>
            adapter={createFakeHostApp().adapter}
            fields={FIELDS}
            // Inline callback + setState: the README's progress-tracking pattern
            onRowComplete={(event) => {
              received.push(event);
              // Capped so a regression fails the assertion instead of hanging the run
              if (received.length < 50) setCount((c) => c + 1);
            }}
          />
        </>
      );
    }

    render(<Host />);
    await goToReview();

    expect(received.map((e) => e.rowIndex)).toEqual([0, 1]);
  });

  it('reports only the edited row to onRowComplete after an edit', async () => {
    mockFile([
      { name: 'Ada', email: 'a@x.io' },
      { name: 'Grace', email: 'g@x.io' },
    ]);
    const received: RowCompleteEvent<Rec>[] = [];

    render(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={FIELDS} onRowComplete={(e) => received.push(e)} />);
    await goToReview();
    received.length = 0;

    fireEvent.click(screen.getByText('Grace'));
    const input = screen.getByDisplayValue('Grace');
    fireEvent.change(input, { target: { value: 'Grace Hopper' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ rowIndex: 1, data: { name: 'Grace Hopper' } });
  });

  it('blocks Commit until invalid rows are fixed or excluded, and reports Excluded Rows', async () => {
    mockFile([
      { name: 'Ada', email: 'a@x.io' },
      { name: '', email: 'nobody@x.io' },
    ]);
    const host = createFakeHostApp<Rec>();

    render(<ImportWizard<Rec, Key> fields={FIELDS} adapter={host.adapter} />);
    await goToReview();

    const complete = screen.getByRole('button', { name: /complete import/i });
    expect(complete).toBeDisabled();

    fireEvent.click(within(rowFor('nobody@x.io')).getByRole('button', { name: /exclude row/i }));

    expect(complete).toBeEnabled();
    await importRows();

    expect(host.records()).toEqual([{ name: 'Ada', email: 'a@x.io' }]);
    const excluded = within(screen.getByRole('region', { name: 'Excluded rows' }));
    expect(excluded.getAllByRole('cell').map((c) => c.textContent)).toEqual(['2', '']);
  });

  it('can include an Excluded Row again', async () => {
    mockFile([{ name: '', email: 'nobody@x.io' }]);
    render(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={FIELDS} />);
    await goToReview();

    const row = () => rowFor('nobody@x.io');
    fireEvent.click(within(row()).getByRole('button', { name: /exclude row/i }));
    fireEvent.click(within(row()).getByRole('button', { name: /include row/i }));

    expect(screen.getByRole('button', { name: /complete import/i })).toBeDisabled();
  });

  it('does not show AI Edit unless the Host App supplies an AI endpoint', async () => {
    mockFile([{ name: 'Ada', email: '' }]);
    render(<ImportWizard adapter={createFakeHostApp().adapter} fields={FIELDS} />);
    await goToReview();

    expect(screen.queryByRole('button', { name: /ai edit/i })).not.toBeInTheDocument();
  });
});

describe('ImportWizard with a date field', () => {
  type DatedKey = 'title' | 'acquired';
  const DATED_FIELDS: FieldConfig<DatedKey>[] = [
    { key: 'title', label: 'Title', type: 'string', matchKeywords: ['title'] },
    { key: 'acquired', label: 'Acquired', type: 'date', matchKeywords: ['acquired'] },
  ];

  beforeEach(() => {
    mockFile([
      { title: 'Dawn', acquired: '15/01/2024' },
      { title: 'Dusk', acquired: '31/12/2023' },
    ]);
  });

  it('search finds a date by the YYYY-MM-DD text the grid shows, and highlights it', async () => {
    render(<ImportWizard<Record<DatedKey, unknown>, DatedKey> adapter={createFakeHostApp().adapter} fields={DATED_FIELDS} />);
    await goToReview();

    fireEvent.change(screen.getByPlaceholderText(/search in data/i), { target: { value: '2024-01-15' } });

    expect(screen.getByText('1 match')).toBeInTheDocument();
    expect(screen.queryByText('Dusk')).not.toBeInTheDocument();
    expect(screen.getByText('2024-01-15').closest('[role="gridcell"]')).toHaveClass('bg-primary/20');
    expect(screen.getByText('Dawn').closest('[role="gridcell"]')).not.toHaveClass('bg-primary/20');
  });

  it('find/replace on a date keeps it a valid calendar date', async () => {
    const host = createFakeHostApp<Record<DatedKey, unknown>>();
    render(<ImportWizard<Record<DatedKey, unknown>, DatedKey> fields={DATED_FIELDS} adapter={host.adapter} />);
    await goToReview();

    fireEvent.click(screen.getByRole('button', { name: /find & replace/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Find'), { target: { value: '2024-01' } });
    fireEvent.change(within(dialog).getByLabelText('Replace with'), { target: { value: '2025-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /replace all/i }));
    expect(within(dialog).getByText(/replaced 1 cell/i)).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.getByText('2025-01-15')).toBeInTheDocument();
    await importRows();
    expect(host.records()[0].acquired).toEqual(new Date(Date.UTC(2025, 0, 15)));
  });
});

describe('DataValidator', () => {
  const rows: RowValidation<Rec>[] = [
    { rowIndex: 0, data: { name: 'Ada', email: 'a@x.io' }, originalData: {}, isValid: true, errors: [], warnings: [] },
  ];

  it('keeps applying the Host App row validator after an edit', () => {
    const validateRow = (data: Rec) =>
      data.name === 'Nope' ? [{ type: 'error' as const, message: 'Name is not allowed' }] : [];
    const onRowsChange = vi.fn();

    render(
      <DataValidator<Rec, Key>
        validatedRows={rows}
        fields={FIELDS}
        validateRow={validateRow}
        onRowsChange={onRowsChange}
        onComplete={() => {}}
        onBack={() => {}}
      />
    );

    fireEvent.click(screen.getByText('Ada'));
    const input = screen.getByDisplayValue('Ada');
    fireEvent.change(input, { target: { value: 'Nope' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const latest: RowValidation<Rec>[] = onRowsChange.mock.calls.at(-1)![0];
    expect(latest[0].isValid).toBe(false);
    expect(latest[0].errors).toEqual([{ field: '', message: 'Name is not allowed' }]);
    expect(screen.getByRole('button', { name: /complete import/i })).toBeDisabled();
  });

  it('does not notify onRowsChange on mount', () => {
    const onRowsChange = vi.fn();
    render(
      <DataValidator<Rec, Key>
        validatedRows={rows}
        fields={FIELDS}
        onRowsChange={onRowsChange}
        onComplete={() => {}}
        onBack={() => {}}
      />
    );

    expect(onRowsChange).not.toHaveBeenCalled();
  });

  it('applies AI Edit changes only to configured fields and existing rows', async () => {
    const aiEdit = vi.fn().mockResolvedValue([
      { rowIndex: 0, changes: { email: 'ada@x.io', isAdmin: true } },
      { rowIndex: 99, changes: { name: 'Ghost' } },
    ]);
    const onRowsChange = vi.fn();

    render(
      <DataValidator<Rec, Key>
        validatedRows={rows}
        fields={FIELDS}
        aiEdit={aiEdit}
        onRowsChange={onRowsChange}
        onComplete={() => {}}
        onBack={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /ai edit/i }));
    const prompt = screen.getByPlaceholderText(/describe how to edit/i);
    fireEvent.change(prompt, { target: { value: 'fix emails' } });
    await act(async () => {
      fireEvent.keyDown(prompt, { key: 'Enter' });
    });
    fireEvent.click(await screen.findByRole('button', { name: /apply changes/i }));

    expect(aiEdit).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'fix emails', rows: [{ rowIndex: 0, data: rows[0].data }] })
    );
    const latest: RowValidation<Record<string, unknown>>[] = onRowsChange.mock.calls.at(-1)![0];
    expect(latest).toHaveLength(1);
    expect(latest[0].data).toEqual({ name: 'Ada', email: 'ada@x.io' });
  });
});

describe('FileUploader preview', () => {
  it("shows the Host App's fields, not the artwork defaults", () => {
    render(<ImportWizard adapter={createFakeHostApp().adapter} fields={FIELDS} />);

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.queryByText('Artist')).not.toBeInTheDocument();
  });
});

describe('ImportWizard upload step', () => {
  const MB = 1024 * 1024;

  /** A file whose reported size is `size` bytes, without allocating it. */
  function fileOfSize(name: string, size: number) {
    const file = new File(['x'], name);
    Object.defineProperty(file, 'size', { value: size });
    return file;
  }

  async function upload(file: File) {
    const input = document.getElementById('file-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
  }

  function expectStillOnUpload() {
    expect(parseFile).not.toHaveBeenCalled();
    expect(document.getElementById('file-input')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue to validation/i })).not.toBeInTheDocument();
  }

  it('refuses a file over the default 10 MB limit with a message and stays on upload', async () => {
    render(<ImportWizard adapter={createFakeHostApp().adapter} fields={FIELDS} />);

    await upload(fileOfSize('people.csv', 10 * MB + 1));

    expect(screen.getByText('people.csv is too large. The maximum file size is 10 MB.')).toBeInTheDocument();
    expectStillOnUpload();
  });

  it('enforces a Host App maxFileSize and accepts a file exactly at the limit', async () => {
    mockFile([{ name: 'Ada', email: '' }]);
    render(<ImportWizard adapter={createFakeHostApp().adapter} fields={FIELDS} maxFileSize={2 * MB} />);

    await upload(fileOfSize('people.csv', 3 * MB));
    expect(screen.getByText('people.csv is too large. The maximum file size is 2 MB.')).toBeInTheDocument();
    expectStillOnUpload();

    await upload(fileOfSize('people.csv', 2 * MB));
    expect(await screen.findByRole('button', { name: /continue to validation/i })).toBeInTheDocument();
  });

  it('refuses a PDF by default, with a message naming the accepted types', async () => {
    render(<ImportWizard adapter={createFakeHostApp().adapter} fields={FIELDS} />);

    await upload(fileOfSize('catalogue.pdf', 100));

    expect(
      screen.getByText('catalogue.pdf is not a supported file type. You can upload: .csv, .xlsx, .xls')
    ).toBeInTheDocument();
    expectStillOnUpload();
  });

  it('refuses a file type outside acceptedFileTypes and advertises only the accepted types', async () => {
    render(<ImportWizard adapter={createFakeHostApp().adapter} fields={FIELDS} acceptedFileTypes={['.csv']} />);
    const input = document.getElementById('file-input') as HTMLInputElement;

    expect(input.accept).toBe('.csv');
    expect(screen.getByText('You can upload: .csv (up to 10 MB)')).toBeInTheDocument();

    await upload(fileOfSize('people.xlsx', 100));

    expect(screen.getByText('people.xlsx is not a supported file type. You can upload: .csv')).toBeInTheDocument();
    expectStillOnUpload();
  });

  it('refuses a dropped file the same way as a picked one', async () => {
    render(<ImportWizard adapter={createFakeHostApp().adapter} fields={FIELDS} acceptedFileTypes={['.csv']} />);
    const dropZone = document.getElementById('file-input')!.parentElement!;

    await act(async () => {
      fireEvent.drop(dropZone, { dataTransfer: { files: [fileOfSize('people.xls', 100)] } });
    });

    expect(screen.getByText('people.xls is not a supported file type. You can upload: .csv')).toBeInTheDocument();
    expectStillOnUpload();
  });

  it('advertises the default accepted types and size, with no HTML or placeholder help text', () => {
    render(<ImportWizard adapter={createFakeHostApp().adapter} fields={FIELDS} />);

    expect((document.getElementById('file-input') as HTMLInputElement).accept).toBe('.csv,.xlsx,.xls');
    expect(screen.getByText('You can upload: .csv, .xlsx, .xls (up to 10 MB)')).toBeInTheDocument();
    expect(screen.queryByText(/html|customize this help text|sample file/i)).not.toBeInTheDocument();
  });
});

describe('ImportWizard title and description', () => {
  it('shows the title and description above the steps when given', () => {
    render(<ImportWizard adapter={createFakeHostApp().adapter} fields={FIELDS} title="Import artworks" description="One row per artwork." />);

    expect(screen.getByRole('heading', { name: 'Import artworks' })).toBeInTheDocument();
    expect(screen.getByText('One row per artwork.')).toBeInTheDocument();
  });

  it('shows no heading of its own when neither is given', () => {
    render(<ImportWizard adapter={createFakeHostApp().adapter} fields={FIELDS} />);

    // The drop zone's "Drag and drop a file here" is the only heading
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Drag and drop a file here']);
  });
});

describe('step indicator in a narrow container', () => {
  /** The container's width, and the full row's natural width, as a browser would lay them out */
  let containerWidth = 0;
  const FULL_ROW_WIDTH = 880;
  let resize: () => void = () => {};

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-step-indicator') ? containerWidth : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.parentElement?.hasAttribute('data-step-indicator') ? FULL_ROW_WIDTH : 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps only the current step’s label visible when the full indicator does not fit, and all of them again when it does', () => {
    containerWidth = 400;
    render(<ImportWizard adapter={createFakeHostApp().adapter} fields={FIELDS} />);

    // Narrow: the other steps' labels are only for screen readers
    expect(screen.getByText('Upload')).not.toHaveClass('sr-only');
    expect(screen.getByText('Match columns')).toHaveClass('sr-only');

    containerWidth = 1000;
    act(() => resize());
    expect(screen.getByText('Match columns')).not.toHaveClass('sr-only');

    containerWidth = 400;
    act(() => resize());
    expect(screen.getByText('Match columns')).toHaveClass('sr-only');
  });
});
