/**
 * The demo's simulated Host App: an in-memory artwork collection and artist
 * registry behind a `HostAppAdapter`, so the whole import flow works on the
 * static demo site.
 *
 * Like a real Host App it honours Import Keys (a row already saved is answered
 * `created` and not saved twice) and it is create-only: an artwork whose title
 * and artist are already in the collection is rejected with a reason. Artists
 * are Related Records of kind `registry`: looked up by the Normalised Match
 * rule, and created once each when the import starts.
 */

import {
  normaliseForMatch,
  type ArtworkRecord,
  type HostAppAdapter,
  type RelatedCandidate,
  type RelatedRecordId,
  type RowOutcome,
} from '@/components/import-wizard';

/** Simulated round trip per request, so the progress can be seen */
const LATENCY_MS = 400;

/** The artists the demo registry starts with */
const ARTISTS = [
  { name: 'Lucio Fontana', description: '1899–1968' },
  { name: 'Piero Manzoni', description: '1933–1963' },
  { name: 'Alberto Burri', description: '1915–1995' },
];

const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
const normalise = (value: unknown) => String(value ?? '').trim().toLowerCase();

export function createDemoHostApp(): HostAppAdapter<ArtworkRecord> {
  const savedKeys = new Set<string>();
  const collection = new Set<string>();
  const registry = new Map<RelatedRecordId, { name: string; description?: string }>(
    ARTISTS.map((artist, i) => [`artist-${i + 1}`, artist])
  );
  // An artwork is identified by its title and its artist's registry ID
  const identity = (record: ArtworkRecord) => `${normalise(record.title)}\u0000${record.artist ?? ''}`;

  return {
    async findRelated(kind, values) {
      await wait();
      const artists = kind === 'registry' ? [...registry] : [];
      return Object.fromEntries(
        values.map((value) => [
          value,
          artists
            .filter(([, artist]) => normaliseForMatch(artist.name) === value)
            .map(([id, artist]): RelatedCandidate => ({ id, ...artist, match: 'normalised' })),
        ])
      );
    },

    async createRelated(kind, name) {
      await wait();
      if (kind !== 'registry') throw new Error(`The demo has no ${kind} records.`);
      const id = `artist-${registry.size + 1}`;
      registry.set(id, { name });
      return id;
    },

    async saveBatch(rows) {
      await wait();
      return rows.map((row): RowOutcome => {
        if (savedKeys.has(row.importKey)) return { importKey: row.importKey, status: 'created' };
        if (collection.has(identity(row.record))) {
          const artist = registry.get(row.record.artist ?? '')?.name ?? row.record.artist;
          return {
            importKey: row.importKey,
            status: 'rejected',
            reason: `"${row.record.title}" by ${artist} is already in the collection.`,
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
