/**
 * The demo's sample spreadsheet must walk every path: read back the file a
 * visitor downloads, the way the wizard reads it, and check each path is
 * really in it.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  autoMatchColumns,
  collectRelatedValues,
  findPossibleMatches,
  formatCalendarDate,
  loadChoiceOptions,
  parseFile,
  validateRows,
  type ParsedFileData,
  type RowValidation,
} from '@/components/import-wizard';
import { blobBytes } from '@/test/spreadsheet';
import { createDemoHostApp, REGISTRY_KIND, type DemoArtwork, type DemoField } from '../hostApp';
import { demoFields, SAMPLE_FILE_NAME, SAMPLE_HEADERS, sampleSpreadsheet } from '../outputShape';

const host = createDemoHostApp({ latencyMs: 0 });
let parsed: ParsedFileData;
let rows: RowValidation<DemoArtwork>[];

beforeAll(async () => {
  const bytes = await blobBytes(sampleSpreadsheet());
  const file = { name: SAMPLE_FILE_NAME, arrayBuffer: async () => bytes.buffer } as unknown as File;
  parsed = await parseFile(file);
  const fields = await loadChoiceOptions(demoFields(host.loadCurrencies));
  rows = validateRows<DemoArtwork, DemoField>(parsed.rows, autoMatchColumns(parsed.headers, fields), { fields });
});

/** A row as the Importer numbers it, from 1 */
const rowNumber = (n: number) => rows[n - 1];

describe('the demo sample spreadsheet', () => {
  it('is an Excel file whose columns all match a field automatically', () => {
    expect(parsed.fileType).toBe('excel');
    expect(parsed.headers).toEqual([...SAMPLE_HEADERS]);
    expect(
      Object.fromEntries(autoMatchColumns(parsed.headers, demoFields(host.loadCurrencies)).map((m) => [m.sourceColumn, m.targetField]))
    ).toEqual({
      Titolo: 'title',
      Artista: 'artist',
      Proprietario: 'owner',
      Anno: 'year',
      Tecnica: 'technique',
      'Data acquisizione': 'acquiredOn',
      Valore: 'valueAmount',
      Valuta: 'valueCurrency',
    });
  });

  it('has exactly one invalid row: row 11, without a title', () => {
    expect(rows.filter((r) => !r.isValid).map((r) => [r.rowIndex + 1, r.errors.map((e) => e.field)])).toEqual([
      [11, ['title']],
    ]);
  });

  it('reads ambiguous dates day-first', () => {
    expect(formatCalendarDate(rowNumber(2).data.acquiredOn as Date)).toBe('2001-04-03');
    expect(formatCalendarDate(rowNumber(7).data.acquiredOn as Date)).toBe('1999-02-01');
  });

  it('spells currencies loosely, and each becomes an option the archive accepts', () => {
    expect(parsed.rows.map((r) => r.Valuta)).toEqual(expect.arrayContaining(['eur', 'Euro', 'euro', 'US dollar']));
    expect(rows.map((r) => r.data.valueCurrency)).toEqual([
      'EUR', 'EUR', 'EUR', 'EUR', 'CHF', 'EUR', 'EUR', 'EUR', 'EUR', 'USD', 'EUR', 'GBP',
    ]);
  });

  describe('its names', () => {
    const lookUp = async () => {
      const values = collectRelatedValues(rows, demoFields(host.loadCurrencies));
      const answer = await host.adapter.findRelated!(REGISTRY_KIND, values.map((v) => v.value));
      return { values, answer };
    };

    it('include a Homonym, used by two rows in two spellings', async () => {
      const { values, answer } = await lookUp();
      const mario = values.find((v) => v.value === 'mario rossi')!;
      expect(mario.rows.map((i) => i + 1)).toEqual([7, 8]);
      expect(mario.spellings.map((s) => s.text)).toEqual(['Mario Rossi', 'mario rossi']);
      expect(answer['mario rossi'].filter((c) => c.match === 'normalised')).toHaveLength(2);
    });

    it('include a Possible Match the archive flags, and one within the file', async () => {
      const { values, answer } = await lookUp();
      expect(answer['l. fontana']).toEqual([expect.objectContaining({ name: 'Lucio Fontana', match: 'possible' })]);
      expect(findPossibleMatches(values)).toEqual([{ kind: REGISTRY_KIND, values: ['piero manzoni', 'manzoni, piero'] }]);
    });

    it('include a new name in two spellings, used as artist and as owner', async () => {
      const { values, answer } = await lookUp();
      const anna = values.find((v) => v.value === 'anna bianchi')!;
      expect(answer['anna bianchi']).toEqual([]);
      expect(anna.fields).toEqual(['artist', 'owner']);
      expect(anna.spellings.map((s) => s.text)).toEqual(['Anna Bianchi', 'anna bianchi']);
      expect(anna.defaultName).toBe('Anna Bianchi');
    });
  });

  it('has a row the "Refuse a title" switch rejects', () => {
    expect(rows.filter((r) => r.data.title === 'Senza titolo').map((r) => r.rowIndex + 1)).toEqual([8]);
  });
});
