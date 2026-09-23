import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ImportWizard } from '../ImportWizard';
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
    render(<ImportWizard fields={FIELDS} />);

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

    render(<ImportWizard<Rec, Key> fields={FIELDS} onRowComplete={(e) => received.push(e)} />);
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
    const onComplete = vi.fn();

    render(<ImportWizard<Rec, Key> fields={FIELDS} onComplete={onComplete} />);
    await goToReview();

    const complete = screen.getByRole('button', { name: /complete import/i });
    expect(complete).toBeDisabled();

    fireEvent.click(within(rowFor('nobody@x.io')).getByRole('button', { name: /exclude row/i }));

    expect(complete).toBeEnabled();
    fireEvent.click(complete);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [data, result] = onComplete.mock.calls[0];
    expect(data).toEqual([{ name: 'Ada', email: 'a@x.io' }]);
    expect(result.excludedRows.map((r: RowValidation<Rec>) => r.rowIndex)).toEqual([1]);
  });

  it('can include an Excluded Row again', async () => {
    mockFile([{ name: '', email: 'nobody@x.io' }]);
    render(<ImportWizard<Rec, Key> fields={FIELDS} />);
    await goToReview();

    const row = () => rowFor('nobody@x.io');
    fireEvent.click(within(row()).getByRole('button', { name: /exclude row/i }));
    fireEvent.click(within(row()).getByRole('button', { name: /include row/i }));

    expect(screen.getByRole('button', { name: /complete import/i })).toBeDisabled();
  });

  it('does not show AI Edit unless the Host App supplies an AI endpoint', async () => {
    mockFile([{ name: 'Ada', email: '' }]);
    render(<ImportWizard fields={FIELDS} />);
    await goToReview();

    expect(screen.queryByRole('button', { name: /ai edit/i })).not.toBeInTheDocument();
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
    render(<ImportWizard fields={FIELDS} />);

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.queryByText('Artist')).not.toBeInTheDocument();
  });
});
