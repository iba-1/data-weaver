import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ImportWizard } from '../ImportWizard';
import { createFakeHostApp } from '@/test/fakeHostApp';
import { importRows } from '@/test/wizardDriver';
import type { ChoiceOption, FieldConfig, RowValidation } from '@/lib/import-wizard/types';

vi.mock('@/lib/import-wizard/parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/import-wizard/parser')>();
  return { ...actual, parseFile: vi.fn() };
});

import { parseFile } from '@/lib/import-wizard/parser';

type Key = 'title' | 'currency';
type Rec = Record<Key, unknown>;

const CURRENCIES: ChoiceOption[] = [
  { value: 'EUR', label: 'Euro' },
  { value: 'USD', label: 'US dollar' },
  { value: 'GBP', label: 'Pound sterling' },
];

/** A fake Host App: its currency endpoint, and the Output Shape that uses it */
function fakeHostApp(loadCurrencies = vi.fn<() => Promise<ChoiceOption[]>>().mockResolvedValue(CURRENCIES)) {
  const fields: FieldConfig<Key>[] = [
    { key: 'title', label: 'Title', type: 'string', required: true, matchKeywords: ['title', 'titolo'] },
    { key: 'currency', label: 'Currency', type: 'choice', options: loadCurrencies, matchKeywords: ['currency', 'valuta'] },
  ];
  return { fields, loadCurrencies };
}

function mockFile(rows: Record<string, unknown>[]) {
  vi.mocked(parseFile).mockResolvedValue({
    headers: Object.keys(rows[0]),
    rows,
    fileName: 'artworks.xlsx',
    fileType: 'excel',
  });
}

async function upload() {
  const input = document.getElementById('file-input') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['x'], 'artworks.xlsx')] } });
  });
}

async function uploadAndContinue() {
  await upload();
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: /continue to validation/i }));
  });
}

async function goToReview() {
  await uploadAndContinue();
  await screen.findByText(/validate data/i);
}

const currencyCell = (row: number) => screen.getByRole('combobox', { name: `Currency, row ${row}` });

/** A promise the test settles by hand, to observe the wizard while options load */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.mocked(parseFile).mockReset();
});

describe('choice fields with options from the Host App', () => {
  it('converts Normalised Matches of an option value or label to the canonical value', async () => {
    mockFile([
      { Titolo: 'Concetto spaziale', Valuta: 'eur' },
      { Titolo: 'Achrome', Valuta: 'Euro' },
      { Titolo: 'Senza titolo', Valuta: ' us  DOLLAR ' },
    ]);
    const { fields } = fakeHostApp();
    const host = createFakeHostApp<Rec>();
    render(<ImportWizard<Rec, Key> fields={fields} adapter={host.adapter} />);

    await goToReview();

    expect(currencyCell(1)).toHaveTextContent('EUR');
    expect(currencyCell(2)).toHaveTextContent('EUR');
    expect(currencyCell(3)).toHaveTextContent('USD');

    await importRows();
    expect(host.records()).toEqual([
      { title: 'Concetto spaziale', currency: 'EUR' },
      { title: 'Achrome', currency: 'EUR' },
      { title: 'Senza titolo', currency: 'USD' },
    ]);
  });

  it('flags a value that matches no option on its cell and blocks completion', async () => {
    mockFile([
      { Titolo: 'Concetto spaziale', Valuta: 'eur' },
      { Titolo: 'Achrome', Valuta: 'Swiss franc' },
    ]);
    const { fields } = fakeHostApp();
    render(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={fields} />);

    await goToReview();

    expect(currencyCell(2)).toHaveTextContent('Swiss franc');
    expect(currencyCell(2)).toHaveAttribute('aria-invalid', 'true');
    expect(currencyCell(2)).toHaveAccessibleDescription('Currency must be one of: Euro, US dollar, Pound sterling');
    expect(currencyCell(1)).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('button', { name: /complete import/i })).toBeDisabled();
  });

  it('leaves an empty choice cell empty and valid when the field is optional', async () => {
    mockFile([{ Titolo: 'Concetto spaziale', Valuta: '' }]);
    const { fields } = fakeHostApp();
    const host = createFakeHostApp<Rec>();
    render(<ImportWizard<Rec, Key> fields={fields} adapter={host.adapter} />);

    await goToReview();
    await importRows();

    expect(host.records()).toEqual([{ title: 'Concetto spaziale', currency: null }]);
  });

  it('edits a choice cell with a picker listing the options', async () => {
    mockFile([{ Titolo: 'Achrome', Valuta: 'Swiss franc' }]);
    const { fields } = fakeHostApp();
    const host = createFakeHostApp<Rec>();
    render(<ImportWizard<Rec, Key> fields={fields} adapter={host.adapter} />);
    await goToReview();

    fireEvent.click(currencyCell(1));
    const picker = screen.getByRole('listbox');
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'EuroEUR',
      'US dollarUSD',
      'Pound sterlingGBP',
      'Clear',
    ]);
    // The picker stays inside the wizard's styling scope
    expect(picker.closest('.dw-root')).not.toBeNull();

    fireEvent.click(within(picker).getByRole('option', { name: /pound sterling/i }));

    expect(currencyCell(1)).toHaveTextContent('GBP');
    expect(currencyCell(1)).not.toHaveAttribute('aria-invalid');
    await importRows();
    expect(host.records()).toEqual([{ title: 'Achrome', currency: 'GBP' }]);
  });

  it('can clear a choice cell from the picker', async () => {
    mockFile([{ Titolo: 'Achrome', Valuta: 'Swiss franc' }]);
    const { fields } = fakeHostApp();
    render(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={fields} />);
    await goToReview();

    fireEvent.click(currencyCell(1));
    fireEvent.click(screen.getByRole('option', { name: /clear/i }));

    expect(currencyCell(1)).toHaveTextContent('empty');
    expect(screen.getByRole('button', { name: /complete import/i })).toBeEnabled();
  });

  it('coerces find/replace results through the same Normalised Match', async () => {
    mockFile([
      { Titolo: 'Achrome', Valuta: 'Swiss franc' },
      { Titolo: 'Concetto spaziale', Valuta: 'Swiss franc' },
    ]);
    const { fields } = fakeHostApp();
    render(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={fields} />);
    await goToReview();

    fireEvent.click(screen.getByRole('button', { name: /find & replace/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Find'), { target: { value: 'Swiss franc' } });
    fireEvent.change(within(dialog).getByLabelText('Replace with'), { target: { value: 'pound sterling' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /replace all/i }));
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(currencyCell(1)).toHaveTextContent('GBP');
    expect(currencyCell(2)).toHaveTextContent('GBP');
    expect(screen.getByRole('button', { name: /complete import/i })).toBeEnabled();
  });

  it('sends the loaded options to AI Edit and matches its proposals the same way', async () => {
    mockFile([{ Titolo: 'Achrome', Valuta: 'Swiss franc' }]);
    const { fields } = fakeHostApp();
    const aiEdit = vi.fn().mockResolvedValue([{ rowIndex: 0, changes: { currency: 'us dollar' } }]);
    render(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={fields} aiEdit={aiEdit} />);
    await goToReview();

    fireEvent.click(screen.getByRole('button', { name: /ai edit/i }));
    const prompt = screen.getByPlaceholderText(/describe how to edit/i);
    fireEvent.change(prompt, { target: { value: 'use dollars' } });
    await act(async () => {
      fireEvent.keyDown(prompt, { key: 'Enter' });
    });
    fireEvent.click(await screen.findByRole('button', { name: /apply changes/i }));

    expect(aiEdit.mock.calls[0][0].fields).toContainEqual({
      key: 'currency',
      label: 'Currency',
      type: 'choice',
      options: CURRENCIES,
    });
    expect(currencyCell(1)).toHaveTextContent('USD');
    expect(currencyCell(1)).not.toHaveAttribute('aria-invalid');
  });

  it('calls the loader once when review starts, not per row, edit or render', async () => {
    mockFile([
      { Titolo: 'Concetto spaziale', Valuta: 'eur' },
      { Titolo: 'Achrome', Valuta: 'Swiss franc' },
      { Titolo: 'Senza titolo', Valuta: 'usd' },
    ]);
    const { fields, loadCurrencies } = fakeHostApp();
    const { rerender } = render(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={fields} />);

    await upload();
    // Column matching doesn't need the options
    expect(await screen.findByRole('button', { name: /continue to validation/i })).toBeInTheDocument();
    expect(loadCurrencies).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue to validation/i }));
    });
    await screen.findByText(/validate data/i);
    expect(loadCurrencies).toHaveBeenCalledTimes(1);

    fireEvent.click(currencyCell(2));
    fireEvent.click(screen.getByRole('option', { name: /euro/i }));
    fireEvent.click(screen.getByText('Achrome'));
    fireEvent.keyDown(screen.getByDisplayValue('Achrome'), { key: 'Enter' });
    rerender(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={fields} />);

    expect(loadCurrencies).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state until the options arrive', async () => {
    mockFile([{ Titolo: 'Achrome', Valuta: 'eur' }]);
    const pending = deferred<ChoiceOption[]>();
    const { fields } = fakeHostApp(vi.fn(() => pending.promise));
    render(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={fields} />);

    await uploadAndContinue();

    expect(screen.getByRole('status')).toHaveTextContent('Loading the options for Currency');
    expect(screen.queryByRole('button', { name: /complete import/i })).not.toBeInTheDocument();

    await act(async () => pending.resolve(CURRENCIES));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(currencyCell(1)).toHaveTextContent('EUR');
  });

  it('shows a loader failure, blocks completion, and loads again on retry', async () => {
    mockFile([{ Titolo: 'Achrome', Valuta: 'eur' }]);
    const loadCurrencies = vi
      .fn<() => Promise<ChoiceOption[]>>()
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockResolvedValueOnce(CURRENCIES);
    const { fields } = fakeHostApp(loadCurrencies);
    const host = createFakeHostApp<Rec>();
    const onEvent = vi.fn();
    render(<ImportWizard<Rec, Key> fields={fields} adapter={host.adapter} onEvent={onEvent} />);

    await uploadAndContinue();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the options for Currency: 503 Service Unavailable');
    expect(screen.queryByRole('button', { name: /complete import/i })).not.toBeInTheDocument();
    expect(onEvent).toHaveBeenCalledWith({
      type: 'ERROR',
      error: 'Could not load the options for Currency: 503 Service Unavailable',
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    });

    expect(loadCurrencies).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await importRows();
    expect(host.records()).toEqual([{ title: 'Achrome', currency: 'EUR' }]);
  });

  it('can go back to column matching after a loader failure', async () => {
    mockFile([{ Titolo: 'Achrome', Valuta: 'eur' }]);
    const { fields } = fakeHostApp(vi.fn().mockRejectedValue(new Error('offline')));
    render(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={fields} />);

    await uploadAndContinue();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: /back to mapping/i }));

    expect(screen.getByRole('button', { name: /continue to validation/i })).toBeInTheDocument();
  });

  it('ignores options that arrive after the Importer went back to column matching', async () => {
    mockFile([{ Titolo: 'Achrome', Valuta: 'eur' }]);
    const pending = deferred<ChoiceOption[]>();
    const { fields } = fakeHostApp(vi.fn(() => pending.promise));
    const onEvent = vi.fn();
    render(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={fields} onEvent={onEvent} />);

    await uploadAndContinue();
    fireEvent.click(screen.getByRole('button', { name: /back to mapping/i }));
    await act(async () => pending.resolve(CURRENCIES));

    expect(screen.getByRole('button', { name: /continue to validation/i })).toBeInTheDocument();
    expect(onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'DATA_VALIDATED' }));
  });

  it('accepts a static list of options', async () => {
    mockFile([{ Titolo: 'Achrome', Valuta: 'Pound Sterling' }]);
    const fields: FieldConfig<Key>[] = [
      { key: 'title', label: 'Title', type: 'string', matchKeywords: ['titolo'] },
      { key: 'currency', label: 'Currency', type: 'choice', options: CURRENCIES, matchKeywords: ['valuta'] },
    ];
    const onEvent = vi.fn();
    render(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={fields} onEvent={onEvent} />);

    await goToReview();

    expect(currencyCell(1)).toHaveTextContent('GBP');
    const validated = onEvent.mock.calls.find(([e]) => e.type === 'DATA_VALIDATED')![0];
    expect(validated.rows.map((r: RowValidation<Rec>) => r.data.currency)).toEqual(['GBP']);
  });

  it('keeps choice cells as compact as text cells, so every grid row has the fixed height', async () => {
    // jsdom has no layout, so this guards the invariant the virtualised grid relies on:
    // every cell of a row uses the same compact cell padding (measured at 45px in Chromium)
    mockFile([{ Titolo: 'Achrome', Valuta: 'eur' }]);
    render(<ImportWizard<Rec, Key> adapter={createFakeHostApp().adapter} fields={fakeHostApp().fields} />);
    await goToReview();

    const cells = within(currencyCell(1).closest('tr') as HTMLElement).getAllByRole('cell');
    const paddings = new Set(cells.map((cell) => cell.className.split(' ').filter((c) => /^p[xy]?-/.test(c)).join(' ')));
    expect(paddings.size).toBe(1);
  });
});
