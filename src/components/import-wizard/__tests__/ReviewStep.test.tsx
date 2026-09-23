import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DataValidator } from '../DataValidator';
import type { FieldConfig, RowValidation } from '@/lib/import-wizard/types';

type Key = 'name' | 'price';
type Rec = Record<Key, unknown>;

const FIELDS: FieldConfig<Key>[] = [
  { key: 'name', label: 'Name', type: 'string', required: true },
  { key: 'price', label: 'Price', type: 'number' },
];

function row(rowIndex: number, data: Rec, isValid = true): RowValidation<Rec> {
  const errors = isValid ? [] : [{ field: 'name', message: 'Name is required' }];
  return { rowIndex, data, originalData: {}, isValid, errors, warnings: [] };
}

function renderReview(rows: RowValidation<Rec>[]) {
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
  const latestRows = (): RowValidation<Rec>[] => onRowsChange.mock.calls.at(-1)![0];
  return { onRowsChange, latestRows };
}

function openFindReplace(find: string, replace: string) {
  fireEvent.click(screen.getByRole('button', { name: /find & replace/i }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Find'), { target: { value: find } });
  fireEvent.change(within(dialog).getByLabelText('Replace with'), { target: { value: replace } });
  return dialog;
}

describe('review step', () => {
  it('replaces matching cells with Find & Replace, coercing numbers, and undo reverts it', () => {
    const { latestRows } = renderReview([
      row(0, { name: 'Ada', price: 100 }),
      row(1, { name: 'Adam', price: 2100 }),
    ]);

    const dialog = openFindReplace('100', '1,000');
    expect(within(dialog).getByText('cells will be updated')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /replace all/i }));

    expect(within(dialog).getByText(/replaced 2 cells/i)).toBeInTheDocument();
    expect(latestRows().map((r) => r.data.price)).toEqual([1000, 21000]);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(latestRows().map((r) => r.data.price)).toEqual([100, 2100]);
  });

  it('matches whole words only when asked', () => {
    const { latestRows } = renderReview([
      row(0, { name: 'Ada', price: null }),
      row(1, { name: 'Adam', price: null }),
    ]);

    const dialog = openFindReplace('ada', 'Grace');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /whole word/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /replace all/i }));

    expect(latestRows().map((r) => r.data.name)).toEqual(['Grace', 'Adam']);
  });

  it('respects case sensitivity', () => {
    renderReview([row(0, { name: 'Ada', price: null })]);

    const dialog = openFindReplace('ada', 'x');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /case sensitive/i }));

    expect(within(dialog).getByText(/no matches found/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /replace all/i })).toBeDisabled();
  });

  it('search narrows the grid to matching rows and counts matching cells', () => {
    renderReview([
      row(0, { name: 'Ada', price: null }),
      row(1, { name: 'Grace', price: null }),
      row(2, { name: 'Adam', price: null }),
    ]);

    fireEvent.change(screen.getByPlaceholderText(/search in data/i), { target: { value: 'ada' } });

    expect(screen.getByText('2 matches')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Adam')).toBeInTheDocument();
    expect(screen.queryByText('Grace')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search in data/i), { target: { value: 'zebra' } });
    expect(screen.getByText('No rows match your search')).toBeInTheDocument();
  });

  it('the error badge filters the grid to rows with errors', () => {
    renderReview([row(0, { name: 'Ada', price: 5 }), row(1, { name: null, price: 7 }, false)]);

    fireEvent.click(screen.getByText(/1 errors/i));

    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('Exclude Errors leaves every invalid row out and unblocks completion', () => {
    renderReview([row(0, { name: 'Ada', price: null }), row(1, { name: null, price: 7 }, false)]);
    const complete = screen.getByRole('button', { name: /complete import/i });
    expect(complete).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /exclude errors/i }));

    expect(complete).toBeEnabled();
    expect(screen.getByText('1 excluded')).toBeInTheDocument();
  });

  it('Fill Required fills empty required fields of invalid rows with placeholders', () => {
    const { latestRows } = renderReview([
      row(0, { name: 'Ada', price: null }),
      row(1, { name: null, price: 7 }, false),
    ]);

    fireEvent.click(screen.getByRole('button', { name: /fill required/i }));

    expect(latestRows()[1]).toMatchObject({ data: { name: 'N/A', price: 7 }, isValid: true });
    expect(screen.getByRole('button', { name: /complete import \(2 rows\)/i })).toBeEnabled();
  });

  it('pages through more rows than fit on one page', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(i, { name: `Person ${i + 1}`, price: null }));
    renderReview(rows);

    expect(screen.getByText(/showing 1-\s*10 of 12 rows/i)).toBeInTheDocument();
    expect(screen.queryByText('Person 12')).not.toBeInTheDocument();

    const pager = screen.getByText('Page 1 of 2').parentElement as HTMLElement;
    fireEvent.click(within(pager).getAllByRole('button')[1]);

    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Person 12')).toBeInTheDocument();
  });
});
