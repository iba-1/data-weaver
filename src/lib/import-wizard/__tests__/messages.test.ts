import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_MESSAGES,
  formatValidationMessage,
  interpolate,
  messageKeys,
  resolveMessages,
  type PartialMessageCatalogue,
} from '../messages';
import { validateRows, revalidateRow } from '../validator';
import { checkUpload } from '../parser';
import { loadChoiceOptions, OptionsLoadError } from '../choices';
import type { FieldConfig } from '../types';

describe('message catalogue', () => {
  it('fills named placeholders, showing numbers in the runtime locale', () => {
    expect(interpolate('{visible} of {total} rows', { visible: 12, total: 10000 })).toBe('12 of 10,000 rows');
  });

  it('leaves placeholders without a parameter as they are', () => {
    expect(interpolate('{field} is {missing}', { field: 'Title' })).toBe('Title is {missing}');
  });

  it('does not read placeholders inside parameter values', () => {
    expect(interpolate('{fileName} is too large', { fileName: '{maxSize}.csv' })).toBe('{maxSize}.csv is too large');
  });

  it('calls function entries with their parameters', () => {
    const messages = resolveMessages({
      review: { rowCount: ({ count }) => (count === 1 ? 'una riga' : `${count} righe`) },
    });
    expect(messages.review.rowCount({ count: 1 })).toBe('una riga');
    expect(messages.review.rowCount({ count: 3 })).toBe('3 righe');
  });

  it('falls back to English for every entry the Host App leaves out', () => {
    const messages = resolveMessages({ review: { title: 'Controlla i dati' } });
    expect(messages.review.title()).toBe('Controlla i dati');
    expect(messages.review.description()).toBe('Review, search, and fix data before importing');
    expect(messages.upload.chooseFile()).toBe('Choose a file');
    expect(messages.review.rowCount({ count: 2 })).toBe('2 rows');
  });

  it('type-checks a Host App’s translations (checked by tsc)', () => {
    const italian: PartialMessageCatalogue = { review: { rowCount: ({ count }) => `${count} righe` } };
    // @ts-expect-error: rowCountFiltered's parameters are `visible` and `total`, not `rows`
    const wrongParams: PartialMessageCatalogue = { review: { rowCountFiltered: ({ rows }: { rows: number }) => `${rows}` } };
    // @ts-expect-error: not a key of the review group
    const unknownKey: PartialMessageCatalogue = { review: { titel: 'Controlla' } };
    // @ts-expect-error: not a group of the catalogue
    const unknownGroup: PartialMessageCatalogue = { reviews: {} };
    // @ts-expect-error: entries are strings or functions
    const notText: PartialMessageCatalogue = { cell: { empty: 0 } };

    expect([wrongParams, unknownKey, unknownGroup, notText]).toHaveLength(4);
    expect(resolveMessages(italian).review.rowCount({ count: 2 })).toBe('2 righe');
  });

  it('resolves over another catalogue, e.g. an enclosing wizard’s', () => {
    const outer = resolveMessages({ cell: { empty: 'vuoto', clear: 'Svuota' } });
    const inner = resolveMessages({ cell: { clear: 'Cancella' } }, outer);
    expect(inner.cell.empty()).toBe('vuoto');
    expect(inner.cell.clear()).toBe('Cancella');
  });
});

describe('messages raised by the core', () => {
  const FIELDS: FieldConfig<'title' | 'acquired' | 'currency'>[] = [
    { key: 'title', label: 'Titolo', type: 'string', required: true },
    { key: 'acquired', label: 'Acquisito', type: 'date' },
    { key: 'currency', label: 'Valuta', type: 'choice', options: [{ value: 'EUR', label: 'Euro' }] },
  ];
  const MAPPINGS = (['title', 'acquired', 'currency'] as const).map((key) => ({
    sourceColumn: key,
    targetField: key,
    confidence: 1,
    isAutoMatched: true,
  }));
  const ITALIAN: PartialMessageCatalogue = {
    validation: {
      required: '{field} è obbligatorio',
      invalidDate: ({ field, dateOrder }) => `${field} non è una data valida (${dateOrder === 'DMY' ? 'GG/MM/AAAA' : 'MM/GG/AAAA'})`,
      notAnOption: '{field} deve essere uno tra: {options}',
    },
  };

  it('carries the catalogue key and parameters of each validation message, with the English text', () => {
    const [row] = validateRows([{ title: '', acquired: '31/02/2024', currency: 'dollari' }], MAPPINGS, { fields: FIELDS });

    expect(row.errors).toEqual([
      { field: 'title', message: 'Titolo is required', messageRef: { key: 'required', params: { field: 'Titolo' } } },
      {
        field: 'acquired',
        message: 'Acquisito is not a valid date (use DD/MM/YYYY or YYYY-MM-DD)',
        messageRef: { key: 'invalidDate', params: { field: 'Acquisito', format: 'DD/MM/YYYY', dateOrder: 'DMY' } },
      },
      {
        field: 'currency',
        message: 'Valuta must be one of: Euro',
        messageRef: { key: 'notAnOption', params: { field: 'Valuta', options: 'Euro' } },
      },
    ]);
  });

  it('formats validation messages in the Host App’s language', () => {
    const [row] = validateRows([{ title: '', acquired: 'ieri', currency: 'dollari' }], MAPPINGS, { fields: FIELDS });

    expect(row.errors.map((e) => formatValidationMessage(e, ITALIAN))).toEqual([
      'Titolo è obbligatorio',
      'Acquisito non è una data valida (GG/MM/AAAA)',
      'Valuta deve essere uno tra: Euro',
    ]);
  });

  it('leaves the Host App’s own validation messages untouched', () => {
    const fields: FieldConfig<'title'>[] = [
      { key: 'title', label: 'Titolo', type: 'string', validate: () => ({ type: 'warning', message: 'Titolo sospetto' }) },
    ];
    const [row] = validateRows([{ title: 'x' }], [MAPPINGS[0]], {
      fields,
      customValidator: () => [{ type: 'error', message: 'Riga non valida' }],
    });

    expect(row.warnings).toEqual([{ field: 'title', message: 'Titolo sospetto' }]);
    expect(row.errors).toEqual([{ field: '', message: 'Riga non valida' }]);
    expect(formatValidationMessage(row.errors[0], ITALIAN)).toBe('Riga non valida');
  });

  it('keeps the key and parameters when a row is revalidated', () => {
    const [row] = validateRows([{ title: 'Achrome', acquired: '', currency: '' }], MAPPINGS, { fields: FIELDS });
    const edited = revalidateRow({ ...row, data: { ...row.data, title: null } }, { fields: FIELDS });

    expect(formatValidationMessage(edited.errors[0], ITALIAN)).toBe('Titolo è obbligatorio');
  });

  it('refuses uploads in the Host App’s language', () => {
    const rules = { acceptedFileTypes: ['.csv'], maxFileSize: 1024 * 1024 };
    const messages: PartialMessageCatalogue = {
      upload: {
        unsupportedType: '{fileName}: tipo di file non supportato ({types})',
        tooLarge: ({ fileName, maxBytes }) => `${fileName} supera ${maxBytes / 1024 / 1024} MB`,
      },
    };

    expect(checkUpload({ name: 'opere.pdf', size: 10 }, rules, messages)).toBe('opere.pdf: tipo di file non supportato (.csv)');
    expect(checkUpload({ name: 'opere.csv', size: 2 * 1024 * 1024 }, rules, messages)).toBe('opere.csv supera 1 MB');
    expect(checkUpload({ name: 'opere.pdf', size: 10 }, rules)).toBe(
      'opere.pdf is not a supported file type. You can upload: .csv'
    );
  });

  it('rejects a failed options loader with the field and reason, for the wizard to translate', async () => {
    const fields: FieldConfig<'currency'>[] = [
      { key: 'currency', label: 'Valuta', type: 'choice', options: () => Promise.reject(new Error('503')) },
    ];

    const error = await loadChoiceOptions(fields).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OptionsLoadError);
    expect(error).toMatchObject({ field: 'Valuta', reason: '503', message: 'Could not load the options for Valuta: 503' });
  });
});

describe('README', () => {
  it('lists every catalogue key', () => {
    const readme = readFileSync(resolve(__dirname, '../../../../README.md'), 'utf8');
    const missing = messageKeys().filter((key) => !readme.includes(`\`${key}\``));
    expect(missing).toEqual([]);
  });

  it('shows every English default as it is in the catalogue', () => {
    const readme = readFileSync(resolve(__dirname, '../../../../README.md'), 'utf8');
    const strings = Object.values(DEFAULT_MESSAGES).flatMap((group) =>
      Object.values(group).filter((entry): entry is string => typeof entry === 'string' && !entry.includes('\n'))
    );
    const missing = strings.filter((text) => !readme.includes(text.replace(/\|/g, '\\|')));
    expect(missing).toEqual([]);
  });
});
