import { describe, it, expect, vi } from 'vitest';
import { hasOptionLoaders, loadChoiceOptions, matchChoice } from '../choices';
import { applyRowEdits, coerceEditedValue } from '../edits';
import { revalidateRow, validateRows } from '../validator';
import type { ChoiceOption, ColumnMapping, FieldConfig, RowValidation } from '../types';

const CURRENCIES: ChoiceOption[] = [
  { value: 'EUR', label: 'Euro' },
  { value: 'USD', label: 'US dollar' },
  { value: 'GBP', label: 'Pound sterling' },
];

type Key = 'title' | 'currency';

const CURRENCY: FieldConfig<Key> = { key: 'currency', label: 'Currency', type: 'choice', options: CURRENCIES };
const FIELDS: FieldConfig<Key>[] = [{ key: 'title', label: 'Title', type: 'string' }, CURRENCY];

const MAPPINGS: ColumnMapping<Key>[] = [
  { sourceColumn: 'Title', targetField: 'title', confidence: 1, isAutoMatched: true },
  { sourceColumn: 'Valuta', targetField: 'currency', confidence: 1, isAutoMatched: true },
];

function validate(currency: unknown, fields: FieldConfig<Key>[] = FIELDS) {
  return validateRows<Record<Key, unknown>, Key>([{ Title: 'Concetto spaziale', Valuta: currency }], MAPPINGS, {
    fields,
  })[0];
}

describe('matchChoice', () => {
  it('returns the canonical value for a Normalised Match of an option value', () => {
    expect(matchChoice('eur', CURRENCIES)).toBe('EUR');
    expect(matchChoice(' Usd\u00a0', CURRENCIES)).toBe('USD');
    expect(matchChoice('EUR', CURRENCIES)).toBe('EUR');
  });

  it('returns the canonical value for a Normalised Match of an option label', () => {
    expect(matchChoice('Euro', CURRENCIES)).toBe('EUR');
    expect(matchChoice('pound  STERLING', CURRENCIES)).toBe('GBP');
  });

  it('ignores accents', () => {
    const options = [{ value: 'citta', label: 'Città di Castello' }];
    expect(matchChoice('CITTA DI CASTELLO', options)).toBe('citta');
    expect(matchChoice('Cittá', options)).toBe('citta');
  });

  it('returns null for anything else', () => {
    expect(matchChoice('Frank', CURRENCIES)).toBeNull();
    expect(matchChoice('eu', CURRENCIES)).toBeNull();
    expect(matchChoice('Euros', CURRENCIES)).toBeNull();
  });

  it('prefers an exact value, then an option value, over another option label', () => {
    const options = [
      { value: 'CHF', label: 'Swiss franc' },
      { value: 'SFR', label: 'chf' },
    ];
    expect(matchChoice('chf', options)).toBe('CHF');
    expect(matchChoice('Swiss Franc', options)).toBe('CHF');
  });

  it('refuses to guess when a value matches several options equally', () => {
    const options = [
      { value: 'A1', label: 'Draft' },
      { value: 'A2', label: 'DRAFT' },
    ];
    expect(matchChoice('draft', options)).toBeNull();
    expect(matchChoice('A2', options)).toBe('A2');
  });

  it('matches options without a label by value only', () => {
    expect(matchChoice('eur', [{ value: 'EUR' }])).toBe('EUR');
  });

  it('matches numbers read from a spreadsheet by their text', () => {
    expect(matchChoice(2024, [{ value: '2024' }])).toBe('2024');
  });
});

describe('choice fields: reading the file', () => {
  it('converts a Normalised Match of an option value to its canonical value', () => {
    const row = validate('eur');
    expect(row.data.currency).toBe('EUR');
    expect(row.isValid).toBe(true);
  });

  it('converts a Normalised Match of an option label to its canonical value', () => {
    expect(validate('Euro').data.currency).toBe('EUR');
    expect(validate('  us   DOLLAR ').data.currency).toBe('USD');
  });

  it('flags any other value on its cell, keeping the text, naming the field and listing options', () => {
    const row = validate('Frank');
    expect(row.data.currency).toBe('Frank');
    expect(row.isValid).toBe(false);
    expect(row.errors).toEqual([
      { field: 'currency', message: 'Currency must be one of: Euro, US dollar, Pound sterling' },
    ]);
  });

  it('lists only a few options when there are many', () => {
    const options = Array.from({ length: 12 }, (_, i) => ({ value: `C${i + 1}` }));
    const row = validate('nope', [{ ...CURRENCY, options }]);
    expect(row.errors[0].message).toBe('Currency must be one of: C1, C2, C3, C4, C5 and 7 more');
  });

  it('leaves an empty cell empty; required-ness is checked separately', () => {
    expect(validate('')).toMatchObject({ data: { currency: null }, isValid: true });
    expect(validate('  ')).toMatchObject({ data: { currency: null }, isValid: true });

    const required = validate('', [FIELDS[0], { ...CURRENCY, required: true }]);
    expect(required.errors).toEqual([{ field: 'currency', message: 'Currency is required' }]);
  });

  it('applies the field transform only to a matched value', () => {
    const transform = vi.fn((value: unknown) => value);
    const fields: FieldConfig<Key>[] = [FIELDS[0], { ...CURRENCY, transform }];
    expect(validate('euro', fields).data.currency).toBe('EUR');
    expect(transform).toHaveBeenCalledWith('EUR');
    transform.mockClear();
    expect(validate('Frank', fields).data.currency).toBe('Frank');
    expect(transform).not.toHaveBeenCalled();
  });

  it('flags every value of a choice field whose options are not loaded, rather than accepting it', () => {
    const row = validate('EUR', [FIELDS[0], { ...CURRENCY, options: async () => CURRENCIES }]);
    expect(row.isValid).toBe(false);
    expect(row.errors).toEqual([{ field: 'currency', message: 'The options for Currency are not loaded' }]);
  });

  it('flags every value of a choice field with no options', () => {
    const row = validate('EUR', [FIELDS[0], { ...CURRENCY, options: [] }]);
    expect(row.errors).toEqual([{ field: 'currency', message: 'Currency has no options to choose from' }]);
  });
});

describe('choice fields: review edits', () => {
  it('coerces an edited value through the same Normalised Match', () => {
    expect(coerceEditedValue('euro', CURRENCY)).toBe('EUR');
    expect(coerceEditedValue(' gbp ', CURRENCY)).toBe('GBP');
    expect(coerceEditedValue('Frank', CURRENCY)).toBe('Frank');
    expect(coerceEditedValue('', CURRENCY)).toBeNull();
    expect(coerceEditedValue('   ', CURRENCY)).toBeNull();
  });

  it('applies edits (cell, find/replace, AI Edit) as canonical values and revalidation flags the rest', () => {
    const rows: RowValidation<Record<Key, unknown>>[] = [
      { rowIndex: 0, data: { title: 'A', currency: 'Frank' }, originalData: {}, isValid: false, errors: [], warnings: [] },
      { rowIndex: 1, data: { title: 'B', currency: 'EUR' }, originalData: {}, isValid: true, errors: [], warnings: [] },
    ];
    const changed = applyRowEdits(
      rows,
      [
        { rowIndex: 0, changes: { currency: 'us dollar' } },
        { rowIndex: 1, changes: { currency: 'Yen' } },
      ],
      FIELDS
    );

    const first = revalidateRow(changed.get(0)!, { fields: FIELDS });
    const second = revalidateRow(changed.get(1)!, { fields: FIELDS });
    expect(first).toMatchObject({ data: { currency: 'USD' }, isValid: true });
    expect(second).toMatchObject({ data: { currency: 'Yen' }, isValid: false });
    expect(second.errors[0]).toMatchObject({ field: 'currency' });
  });
});

describe('loading options', () => {
  it('knows whether any field loads its options', () => {
    expect(hasOptionLoaders(FIELDS)).toBe(false);
    expect(hasOptionLoaders([{ ...CURRENCY, options: async () => [] }])).toBe(true);
  });

  it('calls each loader once and returns the fields with the loaded options', async () => {
    const loadCurrencies = vi.fn().mockResolvedValue(CURRENCIES);
    const loadStatuses = vi.fn().mockResolvedValue([{ value: 'ON_LOAN', label: 'On loan' }]);
    const fields: FieldConfig[] = [
      FIELDS[0],
      { ...CURRENCY, options: loadCurrencies },
      { key: 'status', label: 'Status', type: 'choice', options: loadStatuses },
    ];

    const loaded = await loadChoiceOptions(fields);

    expect(loadCurrencies).toHaveBeenCalledTimes(1);
    expect(loadStatuses).toHaveBeenCalledTimes(1);
    expect(loaded.map((f) => f.options)).toEqual([undefined, CURRENCIES, [{ value: 'ON_LOAN', label: 'On loan' }]]);
    expect(loaded[0]).toBe(fields[0]);
    expect(fields[1].options).toBe(loadCurrencies);
  });

  it('rejects with a message naming the field when a loader fails', async () => {
    const fields: FieldConfig[] = [{ ...CURRENCY, options: () => Promise.reject(new Error('503 Service Unavailable')) }];
    await expect(loadChoiceOptions(fields)).rejects.toThrow(
      'Could not load the options for Currency: 503 Service Unavailable'
    );
  });

  it('rejects when a loader returns something that is not a list of options', async () => {
    const notAList = { ...CURRENCY, options: async () => ({ EUR: 'Euro' }) as unknown as ChoiceOption[] };
    const noValue = { ...CURRENCY, options: async () => [{ label: 'Euro' }] as unknown as ChoiceOption[] };
    await expect(loadChoiceOptions([notAList])).rejects.toThrow(
      'Could not load the options for Currency: expected a list of { value, label } options'
    );
    await expect(loadChoiceOptions([noValue])).rejects.toThrow(/expected a list of \{ value, label \} options/);
  });
});
