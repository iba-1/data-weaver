import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { DataValidator } from '../DataValidator';
import type { ColumnMapping, FieldConfig, RowValidation } from '@/lib/import-wizard/types';
import { validateRows } from '@/lib/import-wizard/validator';

type Key = 'title' | 'unit' | 'amount' | 'currency';
type Rec = Record<Key, unknown>;

const FIELDS: FieldConfig<Key>[] = [
  { key: 'title', label: 'Title', type: 'string', required: true },
  { key: 'unit', label: 'Unit', type: 'choice', options: ['M', 'CM', 'MM'].map((v) => ({ value: v, label: v })) },
  { key: 'amount', label: 'Value', type: 'number' },
  {
    key: 'currency',
    label: 'Currency',
    type: 'choice',
    options: [
      { value: 'EUR', label: 'Euro' },
      { value: 'USD', label: 'US dollar' },
    ],
    validate: (value, row) =>
      !value && row.amount ? { type: 'warning', message: 'No currency: EUR will be used.' } : null,
  },
];

const MAPPINGS: ColumnMapping<Key>[] = FIELDS.map((f) => ({
  sourceColumn: f.label,
  targetField: f.key,
  confidence: 1,
  isAutoMatched: true,
}));

/** The file's rows: [title, unit, amount, currency] */
const FILE: Array<[string, string, string, string]> = [
  ['', 'metri', '100', 'EUR'], // row 1: missing title and unknown unit
  ['Achrome', 'metri', '200', 'EUR'], // row 2: unknown unit
  ['Notturno', 'CM', '300', ''], // row 3: warning only
  ['', 'CM', '400', 'EUR'], // row 4: missing title
  ['Linea', 'centimetri', '500', 'EUR'], // row 5: another unknown unit
  ['Senza titolo', 'CM', 'circa 1800', 'lire'], // row 6: not a number, unknown currency
  ['Bozzetto', 'metri', '600', 'EUR'], // row 7: unknown unit, excluded in some tests
];

function renderReview(exclude: number[] = []) {
  const rows = validateRows<Rec, Key>(
    FILE.map(([title, unit, amount, currency]) => ({ Title: title, Unit: unit, Value: amount, Currency: currency })),
    MAPPINGS,
    { fields: FIELDS }
  ).map((row) => (exclude.includes(row.rowIndex) ? { ...row, excluded: true } : row));
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
  return { latestRows };
}

const fix = (title: string) => fireEvent.click(screen.getByRole('button', { name: `Fix: ${title}` }));
const guide = () => screen.getByRole('region', { name: /^Fixing|Unit|Title|Value|Currency/ }) as HTMLElement;
const gridRowNumbers = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent);

function chooseReplacement(value: string, option: string | RegExp) {
  fireEvent.click(screen.getByRole('combobox', { name: `Value to use instead of "${value}"` }));
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }));
}

describe('the summary of what blocks the import', () => {
  it('counts blocked rows once, and lists one entry per field and cause with its own row count', () => {
    renderReview();

    expect(screen.getByText('6 rows to fix before importing')).toBeInTheDocument();
    const entries = screen.getAllByRole('button', { name: /^Fix: / }).map((b) => b.getAttribute('aria-label'));
    // Three entries first; the rest behind "Show N more"
    expect(entries).toEqual(['Fix: Unit: value not recognised', 'Fix: Title missing', 'Fix: Value: not a number']);
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }));
    expect(screen.getByRole('button', { name: 'Fix: Currency: value not recognised' })).toBeInTheDocument();
    expect(screen.getByText('1 row will be imported')).toBeInTheDocument();
  });
});

describe('fixing one kind of problem', () => {
  it('shows only that problem’s rows, marks its column and moves focus to the guide', () => {
    renderReview();
    fix('Unit: value not recognised');

    expect(gridRowNumbers()).toEqual(['1', '2', '5', '7']);
    expect(document.querySelector('th[data-field="unit"]')).toHaveAttribute('data-active', 'true');
    expect(document.querySelector('#dw-fix-guide-title')).toHaveFocus();
    expect(screen.getByText(/"metri" is not one of the accepted values for Unit/)).toBeInTheDocument();
    expect(screen.getByText(/"centimetri" is not one of the accepted values for Unit/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show all rows' }));
    expect(gridRowNumbers()).toHaveLength(7);
  });

  it('replaces each value apart, showing value, replacement and rows before applying, and leaves excluded rows alone', () => {
    const { latestRows } = renderReview([6]);
    fix('Unit: value not recognised');
    expect(gridRowNumbers()).toEqual(['1', '2', '5']);

    expect(screen.getByRole('button', { name: 'Apply to 2 rows' })).toBeDisabled();
    chooseReplacement('metri', 'M');
    fireEvent.click(screen.getByRole('button', { name: 'Replace "metri" with "M" in 2 rows' }));

    const units = latestRows().map((r) => r.data.unit);
    expect(units).toEqual(['M', 'M', 'CM', 'CM', 'centimetri', 'CM', 'metri']);
    // The rows stay in view once fixed, so nothing vanishes under the Importer
    expect(gridRowNumbers()).toEqual(['1', '2', '5']);
    expect(screen.getByRole('button', { name: 'Apply to 1 row' })).toBeInTheDocument();
  });

  it('keeps a row with two errors blocked after one is fixed, and the counts follow', () => {
    const { latestRows } = renderReview();
    fix('Unit: value not recognised');
    chooseReplacement('metri', 'M');
    fireEvent.click(screen.getByRole('button', { name: 'Replace "metri" with "M" in 3 rows' }));

    const row1 = latestRows()[0];
    expect(row1.isValid).toBe(false);
    expect(row1.errors.map((e) => e.field)).toEqual(['title']);
    // Rows 2 and 7 are fixed; row 1 still misses its title
    expect(screen.getByText('4 rows to fix before importing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unit: value not recognised/ })).toHaveTextContent('1 row');
  });

  it('says the problem is solved, and undo brings back the data and its errors', () => {
    const { latestRows } = renderReview();
    fix('Unit: value not recognised');
    chooseReplacement('metri', 'M');
    fireEvent.click(screen.getByRole('button', { name: 'Replace "metri" with "M" in 3 rows' }));
    chooseReplacement('centimetri', 'CM');
    fireEvent.click(screen.getByRole('button', { name: 'Replace "centimetri" with "CM" in 1 row' }));

    expect(screen.getByRole('status')).toHaveTextContent('Problem solved');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(latestRows()[4].data.unit).toBe('centimetri');
    expect(latestRows()[4].errors.map((e) => e.field)).toEqual(['unit']);
    expect(screen.getByRole('button', { name: 'Apply to 1 row' })).toBeInTheDocument();
  });

  it('keeps editing a single cell usable while the problem’s rows are shown', () => {
    const { latestRows } = renderReview();
    fix('Value: not a number');

    expect(screen.getByText('"circa 1800" contains text. Enter a number, for example 1800, checking the value to record.')).toBeInTheDocument();
    // Nothing is converted for the Importer: the cell keeps its text until they change it
    const cell = screen.getByRole('gridcell', { name: /circa 1800/ });
    expect(cell).toHaveAccessibleDescription(/Value is not a valid number/);

    fireEvent.click(cell);
    const input = screen.getByRole('textbox', { name: 'Value, row 6' });
    expect(input).toHaveAccessibleDescription(/Value is not a valid number/);
    fireEvent.change(input, { target: { value: '1800' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(latestRows()[5].data.amount).toBe(1800);
    expect(gridRowNumbers()).toEqual(['6']);
    expect(screen.getByRole('status')).toHaveTextContent('Problem solved');
  });
});

describe('cell-by-cell fixes', () => {
  it('fills missing titles one at a time, never with one title for every row', async () => {
    const { latestRows } = renderReview();
    fix('Title missing');

    expect(screen.queryByRole('combobox', { name: /Value to use instead/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to the first cell to fix' }));
    const first = await screen.findByRole('textbox', { name: 'Title, row 1' });
    await waitFor(() => expect(first).toHaveFocus());
    fireEvent.change(first, { target: { value: 'Concetto spaziale' } });
    fireEvent.keyDown(first, { key: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: 'Next cell to fix' }));
    const second = await screen.findByRole('textbox', { name: 'Title, row 4' });
    await waitFor(() => expect(second).toHaveFocus());
    fireEvent.change(second, { target: { value: 'Combustione' } });
    fireEvent.keyDown(second, { key: 'Enter' });

    expect(latestRows().map((r) => r.data.title)).toEqual([
      'Concetto spaziale',
      'Achrome',
      'Notturno',
      'Combustione',
      'Linea',
      'Senza titolo',
      'Bozzetto',
    ]);
  });

  it('replacing a currency changes only the currency, never the amount', () => {
    const { latestRows } = renderReview();
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }));
    fix('Currency: value not recognised');
    expect(screen.getByText(/"lire" is not one of the accepted values for Currency/)).toBeInTheDocument();

    chooseReplacement('lire', /^Euro/);
    fireEvent.click(screen.getByRole('button', { name: 'Replace "lire" with "Euro" in 1 row' }));

    expect(latestRows()[5].data.currency).toBe('EUR');
    expect(latestRows()[5].data.amount).toBe('circa 1800');
  });
});

describe('importing with warnings', () => {
  it('can import once no included row has an error, even with warnings left', () => {
    renderReview([0, 1, 3, 4, 5, 6]);

    expect(screen.getByText('Nothing blocks the import')).toBeInTheDocument();
    expect(screen.getByText(/1 warning · they don't block the import/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete Import (1 row)' })).toBeEnabled();
  });
});
