import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DataValidator } from '../DataValidator';
import type { FieldConfig, RowValidation } from '@/lib/import-wizard/types';
import { REVIEW_ROW_HEIGHT } from '../review/ReviewRow';
import { TEST_VIEWPORT_HEIGHT, scrollReviewGrid } from '@/test/reviewGridLayout';

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
    expect(within(dialog).getByText('2 cells will be updated')).toBeInTheDocument();
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

  it('shows every row in one scrollable grid, with the row count', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(i, { name: `Person ${i + 1}`, price: null }));
    renderReview(rows);

    expect(screen.getByText('12 rows')).toBeInTheDocument();
    expect(screen.getByText('Person 1')).toBeInTheDocument();
    expect(screen.getByText('Person 12')).toBeInTheDocument();
    expect(screen.queryByText(/showing|page 1/i)).not.toBeInTheDocument();
  });

  it('the excluded badge filters the grid to excluded rows', () => {
    renderReview([row(0, { name: 'Ada', price: null }), row(1, { name: 'Grace', price: null })]);

    fireEvent.click(screen.getByRole('button', { name: 'Exclude row 2' }));
    fireEvent.click(screen.getByText('1 Excluded'));

    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
    expect(screen.getByText('Grace')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 rows')).toBeInTheDocument();
  });
});

describe('review step with 10,000 rows', () => {
  const ROW_COUNT = 10_000;
  /** "10,000" in the test machine's locale, as the row count shows it */
  const TOTAL = ROW_COUNT.toLocaleString();

  function bigFile(invalidRowIndexes: number[] = []): RowValidation<Rec>[] {
    return Array.from({ length: ROW_COUNT }, (_, i) =>
      row(i, { name: `Person ${i + 1}`, price: i }, !invalidRowIndexes.includes(i))
    );
  }

  /** The data rows in the DOM (not the header or the spacers standing in for the rest) */
  function renderedRows() {
    return screen.getAllByRole('row').filter((tr) => tr.hasAttribute('aria-rowindex') && tr.closest('tbody'));
  }

  it('renders only the rows in view', () => {
    renderReview(bigFile());

    expect(screen.getByText(`${TOTAL} rows`)).toBeInTheDocument();
    expect(screen.getByText('Person 1')).toBeInTheDocument();
    expect(screen.queryByText('Person 10000')).not.toBeInTheDocument();
    // The viewport fits about 9 rows; overscan adds a few more, never thousands
    expect(renderedRows().length).toBeGreaterThanOrEqual(Math.floor(TEST_VIEWPORT_HEIGHT / REVIEW_ROW_HEIGHT));
    expect(renderedRows().length).toBeLessThan(40);
  });

  it('scrolling brings row 9,000 into view', () => {
    renderReview(bigFile());

    scrollReviewGrid(8_999 * REVIEW_ROW_HEIGHT);

    expect(screen.getByText('Person 9000')).toBeInTheDocument();
    expect(screen.queryByText('Person 1')).not.toBeInTheDocument();
    expect(renderedRows().length).toBeLessThan(40);
  });

  it('editing row 9,000 changes only that row, and undo restores the previous rows exactly', () => {
    const rows = bigFile();
    const { latestRows } = renderReview(rows);

    scrollReviewGrid(8_999 * REVIEW_ROW_HEIGHT);
    fireEvent.click(screen.getByText('Person 9000'));
    const input = screen.getByDisplayValue('Person 9000');
    fireEvent.change(input, { target: { value: 'Grace Hopper' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    const edited = latestRows();
    expect(edited[8_999].data.name).toBe('Grace Hopper');
    // A new array, but every untouched row is the same object: undo snapshots share them
    expect(edited).not.toBe(rows);
    expect(edited.filter((r, i) => r !== rows[i]).map((r) => r.rowIndex)).toEqual([8_999]);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    expect(latestRows()).toBe(rows);
    expect(screen.getByText('Person 9000')).toBeInTheDocument();
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
  });

  it('an edit left open on a row scrolled out of view is saved', () => {
    const { latestRows } = renderReview(bigFile());

    fireEvent.click(screen.getByText('Person 1'));
    fireEvent.change(screen.getByDisplayValue('Person 1'), { target: { value: 'Ada Lovelace' } });
    scrollReviewGrid(5_000 * REVIEW_ROW_HEIGHT);

    expect(screen.queryByDisplayValue('Ada Lovelace')).not.toBeInTheDocument();
    expect(latestRows()[0].data.name).toBe('Ada Lovelace');
  });

  it('search finds a row far down the file', () => {
    renderReview(bigFile());

    fireEvent.change(screen.getByPlaceholderText(/search in data/i), { target: { value: 'Person 9500' } });

    expect(screen.getByText('1 match')).toBeInTheDocument();
    expect(screen.getByText(`1 of ${TOTAL} rows`)).toBeInTheDocument();
    expect(screen.getByText('Person 9500')).toBeInTheDocument();
  });

  it('the error badge finds errors anywhere in the file', () => {
    renderReview(bigFile([4_200, 9_876]));

    fireEvent.click(screen.getByText(/2 errors/i));

    expect(screen.getByText(`2 of ${TOTAL} rows`)).toBeInTheDocument();
    expect(renderedRows()).toHaveLength(2);
    expect(screen.getByText('Person 4201')).toBeInTheDocument();
    expect(screen.getByText('Person 9877')).toBeInTheDocument();
  });

  it('Find & Replace changes a cell anywhere in the file', () => {
    const { latestRows } = renderReview(bigFile());

    const dialog = openFindReplace('Person 9999', 'Grace');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /whole word/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /replace all/i }));

    expect(within(dialog).getByText(/replaced 1 cell/i)).toBeInTheDocument();
    expect(latestRows()[9_998].data.name).toBe('Grace');
  });
});
