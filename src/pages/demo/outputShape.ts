/**
 * The demo's Output Shape (an artwork in the Archivio Serra) and its sample
 * spreadsheet, written so that one upload walks every path of an import.
 */

import { sheetToBlob, type ChoiceOption, type FieldConfig } from '@/components/import-wizard';
import { REGISTRY_KIND, type DemoField } from './hostApp';

/** An artwork's fields; the currencies come from the Host App when the review opens */
export function demoFields(loadCurrencies: () => Promise<ChoiceOption[]>): FieldConfig<DemoField>[] {
  return [
    { key: 'title', label: 'Title', type: 'string', required: true, matchKeywords: ['title', 'titolo', 'opera'] },
    {
      key: 'artist',
      label: 'Artist',
      type: 'string',
      relationship: { kind: REGISTRY_KIND },
      matchKeywords: ['artist', 'artista', 'autore', 'author'],
    },
    {
      key: 'owner',
      label: 'Owner',
      type: 'string',
      relationship: { kind: REGISTRY_KIND },
      matchKeywords: ['owner', 'proprietario', 'proprieta'],
    },
    { key: 'year', label: 'Year', type: 'number', matchKeywords: ['year', 'anno'] },
    { key: 'technique', label: 'Technique', type: 'string', matchKeywords: ['technique', 'tecnica', 'medium'] },
    {
      key: 'acquiredOn',
      label: 'Acquired on',
      type: 'date',
      matchKeywords: ['acquired on', 'data acquisizione', 'acquisizione'],
    },
    { key: 'valueAmount', label: 'Value', type: 'number', matchKeywords: ['value', 'valore', 'stima'] },
    {
      key: 'valueCurrency',
      label: 'Currency',
      type: 'choice',
      options: loadCurrencies,
      matchKeywords: ['currency', 'valuta'],
    },
  ];
}

export const SAMPLE_FILE_NAME = 'archivio-serra-sample.xlsx';

export const SAMPLE_HEADERS = [
  'Titolo',
  'Artista',
  'Proprietario',
  'Anno',
  'Tecnica',
  'Data acquisizione',
  'Valore',
  'Valuta',
] as const;

type SampleCell = string | number | null;

/**
 * The sample's rows, as a collection's own spreadsheet would have them. Row
 * numbers (from 1) are those the Importer sees; `SAMPLE_PATHS` says what each
 * one exercises.
 */
export const SAMPLE_ROWS: SampleCell[][] = [
  ['Concetto spaziale, Attese', 'L. Fontana', 'Galleria del Naviglio', 1959, 'Idropittura su tela, tagli', '15/03/1987', 850000, 'EUR'],
  ['Concetto spaziale', 'L. Fontana', 'Collezione Serra', 1962, 'Olio su tela, buchi', '03/04/2001', 620000, 'eur'],
  ['Achrome', 'Piero Manzoni', 'Anna Bianchi', 1958, 'Caolino su tela grinzata', '2004-09-21', 410000, 'Euro'],
  ['Linea m 19,93', 'Manzoni, Piero', 'Collezione Serra', 1959, 'Inchiostro su carta', '12/11/2010', 95000, 'EUR'],
  ['Corpo d’aria', 'Piero Manzoni', null, 1960, 'Palloncino e base in legno', null, 60000, 'CHF'],
  ['Sacco e rosso', 'Alberto Burri', 'Galleria del Naviglio', 1954, 'Sacco, olio e vinavil su tela', '22/06/1995', 1200000, 'euro'],
  ['Paesaggio lombardo', 'Mario Rossi', 'Collezione Serra', 1978, 'Olio su tavola', '01/02/1999', 4500, 'EUR'],
  ['Senza titolo', 'mario rossi', 'Anna Bianchi', 2015, 'Acrilico su carta', '30/10/2018', 1800, 'EUR'],
  ['Studio per un ritratto', 'Anna Bianchi', null, 2019, 'Carboncino su carta', '07/05/2020', 900, 'eur'],
  ['Notturno', 'anna bianchi', 'Collezione Serra', 2021, 'Tecnica mista su tela', '14/09/2022', 2200, 'US dollar'],
  [null, 'Alberto Burri', 'Collezione Serra', 1956, 'Combustione su plastica', '18/12/2003', 300000, 'EUR'],
  ['Cretto nero', 'Alberto Burri', 'Galleria del Naviglio', 1972, 'Acrovinilico su cellotex', '09/10/2012', 950000, 'GBP'],
];

/** What the sample exercises, with the rows to look at (numbered as the Importer sees them) */
export const SAMPLE_PATHS: ReadonlyArray<{ rows: string; path: string; detail: string }> = [
  { rows: '11', path: 'Invalid row', detail: 'no title: type one in the review, or exclude the row' },
  { rows: '2, 7', path: 'Day-first dates', detail: '03/04/2001 is 3 April; 01/02/1999 is 1 February' },
  { rows: '2, 3, 6, 10', path: 'Currencies from the archive', detail: '"eur", "Euro" and "US dollar" become EUR and USD' },
  { rows: '7, 8', path: 'Homonyms', detail: 'two Mario Rossi in the registry: pick one, or one per row' },
  { rows: '1, 2', path: 'Possible Match in the registry', detail: 'the archive suggests L. Fontana may be Lucio Fontana' },
  { rows: '3–5', path: 'Possible Match in the file', detail: '"Manzoni, Piero" and "Piero Manzoni": merge or keep apart' },
  { rows: '3, 8–10', path: 'New record, created once', detail: 'Anna Bianchi / anna bianchi, as artist and as owner' },
  { rows: '8', path: 'A row the archive can refuse', detail: 'turn on "Refuse a title" to reject "Senza titolo"' },
];

/** The sample spreadsheet, as an Excel file */
export function sampleSpreadsheet(): Blob {
  return sheetToBlob([[...SAMPLE_HEADERS], ...SAMPLE_ROWS], { sheetName: 'Opere', format: 'xlsx' });
}
