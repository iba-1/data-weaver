/**
 * The demo's sample spreadsheet, taken as far as each specimen needs it: the
 * columns auto-matched to the Output Shape, the currencies loaded from the
 * simulated archive, and the rows validated. The specimens start from the
 * same file the live demo offers for download.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  autoMatchColumns,
  loadChoiceOptions,
  validateRows,
  type ColumnMapping,
  type FieldConfig,
  type RowValidation,
} from '@/components/import-wizard';
import type { DemoArtwork, DemoField, DemoHostApp } from '../demo/hostApp';
import { demoFields, SAMPLE_HEADERS, SAMPLE_ROWS } from '../demo/outputShape';

/** The sample's rows as the parser hands them over: one object per row, keyed by column name */
export function sampleSourceRows(): Record<string, unknown>[] {
  return SAMPLE_ROWS.map((cells) => Object.fromEntries(SAMPLE_HEADERS.map((header, i) => [header, cells[i] ?? ''])));
}

/** The sample's columns, auto-matched to the demo's fields */
export function sampleMappings(fields: FieldConfig<DemoField>[]): ColumnMapping<DemoField>[] {
  return autoMatchColumns([...SAMPLE_HEADERS], fields);
}

export interface SampleImport {
  /** The fields, with the currencies loaded from the archive */
  fields: FieldConfig<DemoField>[];
  rows: RowValidation<DemoArtwork>[];
}

/** The sample validated against the demo's fields, once the archive has answered with its currencies */
export function useSampleImport(host: DemoHostApp): SampleImport | null {
  const unloaded = useMemo(() => demoFields(host.loadCurrencies), [host]);
  const [sample, setSample] = useState<SampleImport | null>(null);

  useEffect(() => {
    let current = true;
    loadChoiceOptions(unloaded).then((fields) => {
      if (!current) return;
      const rows = validateRows<DemoArtwork, DemoField>(sampleSourceRows(), sampleMappings(fields), { fields });
      setSample({ fields, rows });
    });
    return () => {
      current = false;
    };
  }, [unloaded]);

  return sample;
}
