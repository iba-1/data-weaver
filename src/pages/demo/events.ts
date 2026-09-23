/**
 * The wizard's events as the demo's activity log shows them: one short line
 * per event that says something about the import, nothing for the per-row ones.
 */

import type { ImportReport, ImportWizardEvent } from '@/components/import-wizard';
import type { ActivityTone } from './hostApp';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "10 imported · 1 rejected · 1 excluded" */
export function reportCounts(report: ImportReport<unknown>): string {
  return `${report.created.length} imported · ${report.rejected.length} rejected · ${report.excluded.length} excluded`;
}

export function describeEvent(event: ImportWizardEvent<unknown>): { text: string; tone: ActivityTone } | null {
  switch (event.type) {
    case 'FILE_PARSED':
      return { text: `File read: ${event.data.fileName}, ${plural(event.data.rows.length, 'row')}`, tone: 'neutral' };
    case 'COMMIT_STARTED':
      return {
        text: `Commit started: ${plural(event.rows, 'row')} in ${plural(event.batches, 'batch', 'batches')}, ${event.excluded} excluded`,
        tone: 'neutral',
      };
    case 'BATCH_RETRY': {
      const { batch, batches, attempt, attempts, delayMs } = event.retry;
      return {
        text: `Batch ${batch}/${batches} failed in transit; attempt ${attempt} of ${attempts} in ${(delayMs / 1000).toFixed(1)} s, same Import Keys`,
        tone: 'warning',
      };
    }
    case 'BATCH_SETTLED':
      return {
        text: `Batch ${event.progress.batch}/${event.progress.batches} settled: ${event.created.length} created, ${event.rejected.length} rejected`,
        tone: event.rejected.length > 0 ? 'warning' : 'success',
      };
    case 'IMPORT_FINISHED':
      return { text: `Import finished: ${reportCounts(event.report)}`, tone: 'success' };
    case 'ERROR':
      return { text: `Error: ${event.error}`, tone: 'danger' };
    default:
      return null;
  }
}
