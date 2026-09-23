/**
 * The demo's simulated Host App: an in-memory artwork collection behind a
 * `saveBatch` adapter, so the whole import flow works on the static demo site.
 *
 * Like a real Host App it honours Import Keys (a row already saved is answered
 * `created` and not saved twice) and it is create-only: an artwork whose title
 * and artist are already in the collection is rejected with a reason.
 */

import type { ArtworkRecord, HostAppAdapter, RowOutcome } from '@/components/import-wizard';

/** Simulated round trip per batch, so the progress can be seen */
const LATENCY_MS = 400;

const normalise = (value: unknown) => String(value ?? '').trim().toLowerCase();
const identity = (record: ArtworkRecord) => `${normalise(record.title)}\u0000${normalise(record.artist)}`;

export function createDemoHostApp(): HostAppAdapter<ArtworkRecord> {
  const savedKeys = new Set<string>();
  const collection = new Set<string>();

  return {
    async saveBatch(rows) {
      await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
      return rows.map((row): RowOutcome => {
        if (savedKeys.has(row.importKey)) return { importKey: row.importKey, status: 'created' };
        if (collection.has(identity(row.record))) {
          return {
            importKey: row.importKey,
            status: 'rejected',
            reason: `"${row.record.title}" by ${row.record.artist} is already in the collection.`,
            field: 'title',
          };
        }
        savedKeys.add(row.importKey);
        collection.add(identity(row.record));
        return { importKey: row.importKey, status: 'created' };
      });
    },
  };
}
