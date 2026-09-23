/**
 * The demo's simulated Host App, the "Archivio Serra": an in-memory artwork
 * collection and registry of people and organisations behind a
 * `HostAppAdapter`, so the whole import flow works on the static demo site.
 *
 * Like a real Host App (ADR-0002) it honours Import Keys: a row already saved
 * is answered `created` and not saved again. It is create-only: an artwork
 * whose title and artist are already in the collection is rejected with a
 * reason. Registry entries are Related Records of kind `registry`, looked up
 * by the Normalised Match rule (two "Mario Rossi" are Homonyms) and, like a
 * careful backend, flagged as Possible Matches when a name could be one of
 * them (`L. Fontana` for Lucio Fontana).
 *
 * The demo page's own controls make it misbehave on purpose: refuse rows with
 * a chosen title, or save the next batch and then lose the answer. Everything
 * it does is observable (`subscribe` / `getSnapshot`) so the page can show the
 * store and an activity log.
 */

import {
  isPossibleMatch,
  normaliseForMatch,
  type ChoiceOption,
  type HostAppAdapter,
  type ImportRow,
  type RelatedCandidate,
  type RelatedRecordId,
  type RowOutcome,
} from '@/components/import-wizard';

/** The fields of an artwork in the demo's Output Shape */
export type DemoField =
  | 'title'
  | 'artist'
  | 'owner'
  | 'year'
  | 'technique'
  | 'acquiredOn'
  | 'valueAmount'
  | 'valueCurrency';

/** An artwork as the wizard sends it: `artist` and `owner` hold registry IDs */
export type DemoArtwork = Record<DemoField, unknown>;

/** The kind of Related Record the registry holds */
export const REGISTRY_KIND = 'registry';

export interface RegistryEntry {
  id: string;
  name: string;
  description?: string;
  /** Created by an import in this tab, rather than one of the archive's own entries */
  createdByImport: boolean;
}

export interface SavedArtwork {
  importKey: string;
  /** The row number the Importer saw (from 1) */
  rowNumber: number;
  record: DemoArtwork;
}

export type ActivityTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface ActivityEntry {
  /** Increasing, so the log can be ordered and keyed */
  seq: number;
  /** `host`: the adapter's side; `wizard`: an event the page received */
  source: 'host' | 'wizard';
  text: string;
  tone: ActivityTone;
}

export interface DemoHostSettings {
  /** Refuse every row whose title is this one (compared by Normalised Match) */
  refuseTitle: { enabled: boolean; title: string };
  /** Save the next batch, then fail its answer, once */
  loseNextBatch: boolean;
}

export interface DemoHostSnapshot {
  settings: DemoHostSettings;
  registry: RegistryEntry[];
  /** In the order they were saved */
  artworks: SavedArtwork[];
  /** Rows answered `created` without saving, because their Import Key was already saved */
  repeatsIgnored: number;
  /** `saveBatch` calls so far */
  batchCalls: number;
  /** Newest last; at most `MAX_ACTIVITY` */
  activity: ActivityEntry[];
}

export interface DemoHostApp {
  adapter: HostAppAdapter<DemoArtwork>;
  /** The currencies the archive accepts, as a choice field's options loader */
  loadCurrencies: () => Promise<ChoiceOption[]>;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => DemoHostSnapshot;
  setRefuseTitle: (patch: Partial<DemoHostSettings['refuseTitle']>) => void;
  setLoseNextBatch: (on: boolean) => void;
  /** Add a line to the activity log (the page logs the wizard's events here) */
  note: (text: string, tone?: ActivityTone) => void;
  /** Back to the archive's own registry, with no artworks */
  reset: () => void;
}

/** The archive's registry before any import */
export const SEED_REGISTRY: ReadonlyArray<Omit<RegistryEntry, 'createdByImport'>> = [
  { id: 'reg-1', name: 'Lucio Fontana', description: 'Artist, 1899–1968' },
  { id: 'reg-2', name: 'Alberto Burri', description: 'Artist, 1915–1995' },
  { id: 'reg-3', name: 'Mario Rossi', description: 'Painter, b. 1950, Bergamo' },
  { id: 'reg-4', name: 'Mario Rossi', description: 'Illustrator, b. 1987, Napoli' },
  { id: 'reg-5', name: 'Galleria del Naviglio', description: 'Gallery, Milano' },
  { id: 'reg-6', name: 'Collezione Serra', description: 'Private collection, Torino' },
];

/** What the archive's currency endpoint answers */
export const CURRENCIES: ReadonlyArray<ChoiceOption> = [
  { value: 'EUR', label: 'Euro' },
  { value: 'USD', label: 'US dollar' },
  { value: 'GBP', label: 'Pound sterling' },
  { value: 'CHF', label: 'Swiss franc' },
];

export const DEFAULT_REFUSED_TITLE = 'Senza titolo';
const MAX_ACTIVITY = 60;

export interface DemoHostAppOptions {
  /** Simulated round trip per request, so progress can be seen; 0 in tests */
  latencyMs?: number;
}

export function createDemoHostApp({ latencyMs = 400 }: DemoHostAppOptions = {}): DemoHostApp {
  const wait = (factor = 1) =>
    latencyMs > 0 ? new Promise((resolve) => setTimeout(resolve, latencyMs * factor)) : Promise.resolve();

  let settings: DemoHostSettings = {
    refuseTitle: { enabled: false, title: DEFAULT_REFUSED_TITLE },
    loseNextBatch: false,
  };
  let registry: RegistryEntry[] = [];
  let artworks: SavedArtwork[] = [];
  let savedKeys = new Set<string>();
  let repeatsIgnored = 0;
  let batchCalls = 0;
  let activity: ActivityEntry[] = [];
  let seq = 0;
  let nextId = 1;
  let snapshot: DemoHostSnapshot;
  const listeners = new Set<() => void>();

  const emit = () => {
    snapshot = { settings, registry, artworks, repeatsIgnored, batchCalls, activity };
    listeners.forEach((listener) => listener());
  };

  const log = (source: ActivityEntry['source'], text: string, tone: ActivityTone = 'neutral') => {
    activity = [...activity, { seq: ++seq, source, text, tone }].slice(-MAX_ACTIVITY);
  };

  const seed = () => {
    registry = SEED_REGISTRY.map((entry) => ({ ...entry, createdByImport: false }));
    nextId = SEED_REGISTRY.length + 1;
    artworks = [];
    savedKeys = new Set();
    repeatsIgnored = 0;
    batchCalls = 0;
  };
  seed();

  const nameOf = (id: unknown) => registry.find((entry) => entry.id === id)?.name ?? String(id ?? '');
  // An artwork is identified by its title and its artist's registry ID
  const identity = (record: DemoArtwork) => `${normaliseForMatch(String(record.title ?? ''))}\u0000${record.artist ?? ''}`;

  /** The archive's own rules; `null` saves the row */
  const refusalFor = (record: DemoArtwork): { reason: string; field: DemoField } | null => {
    const title = String(record.title ?? '');
    const { enabled, title: refused } = settings.refuseTitle;
    if (enabled && refused.trim() !== '' && normaliseForMatch(title) === normaliseForMatch(refused)) {
      return {
        reason: `The archive does not accept "${title}" as a title: add what tells this work apart, e.g. "${title} (blu)".`,
        field: 'title',
      };
    }
    if (artworks.some((saved) => identity(saved.record) === identity(record))) {
      return { reason: `"${title}" by ${nameOf(record.artist)} is already in the collection.`, field: 'title' };
    }
    return null;
  };

  const candidatesFor = (value: string): RelatedCandidate[] =>
    registry.flatMap((entry): RelatedCandidate[] => {
      const base = { id: entry.id, name: entry.name, ...(entry.description && { description: entry.description }) };
      if (normaliseForMatch(entry.name) === value) return [{ ...base, match: 'normalised' }];
      if (isPossibleMatch(value, entry.name)) return [{ ...base, match: 'possible' }];
      return [];
    });

  const adapter: HostAppAdapter<DemoArtwork> = {
    async findRelated(kind, values) {
      await wait();
      const answer = Object.fromEntries(
        values.map((value) => [value, kind === REGISTRY_KIND ? candidatesFor(value) : []])
      );
      const counts = Object.values(answer).map((candidates) => candidates.filter((c) => c.match === 'normalised').length);
      const possible = Object.values(answer).filter(
        (candidates) => candidates.length > 0 && candidates.every((c) => c.match === 'possible')
      ).length;
      log(
        'host',
        `findRelated(${kind}) · ${values.length} names → ${counts.filter((n) => n === 1).length} found, ` +
          `${counts.filter((n) => n > 1).length} homonym, ${possible} possible, ${counts.filter((n) => n === 0).length - possible} new`
      );
      emit();
      return answer;
    },

    async createRelated(kind, name) {
      await wait(0.5);
      if (kind !== REGISTRY_KIND) {
        log('host', `createRelated(${kind}, "${name}") refused: no such kind`, 'danger');
        emit();
        throw new Error(`The archive has no ${kind} records.`);
      }
      const id = `reg-${nextId++}`;
      registry = [...registry, { id, name, createdByImport: true }];
      log('host', `createRelated(${kind}, "${name}") → ${id}`, 'success');
      emit();
      return id as RelatedRecordId;
    },

    async saveBatch(rows: ImportRow<DemoArtwork>[]) {
      const call = ++batchCalls;
      await wait();
      let saved = 0;
      let repeated = 0;
      let refused = 0;
      const outcomes = rows.map((row): RowOutcome => {
        if (savedKeys.has(row.importKey)) {
          repeated++;
          repeatsIgnored++;
          return { importKey: row.importKey, status: 'created' };
        }
        const refusal = refusalFor(row.record);
        if (refusal) {
          refused++;
          return { importKey: row.importKey, status: 'rejected', ...refusal };
        }
        savedKeys.add(row.importKey);
        artworks = [...artworks, { importKey: row.importKey, rowNumber: row.rowIndex + 1, record: row.record }];
        saved++;
        return { importKey: row.importKey, status: 'created' };
      });

      const parts = [`${saved} saved`];
      if (repeated) parts.push(`${repeated} already saved (Import Key)`);
      if (refused) parts.push(`${refused} refused`);
      const summary = `saveBatch #${call} · ${rows.length} rows → ${parts.join(', ')}`;

      if (settings.loseNextBatch) {
        settings = { ...settings, loseNextBatch: false };
        log('host', `${summary}; then the answer was lost`, 'danger');
        emit();
        throw new Error('The connection dropped before the answer arrived (simulated).');
      }
      log('host', summary, refused ? 'warning' : 'success');
      emit();
      return outcomes;
    },
  };

  emit();

  return {
    adapter,
    async loadCurrencies() {
      await wait(1.5);
      log('host', `Currency list loaded · ${CURRENCIES.length} options`);
      emit();
      return CURRENCIES.map((option) => ({ ...option }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    setRefuseTitle(patch) {
      settings = { ...settings, refuseTitle: { ...settings.refuseTitle, ...patch } };
      emit();
    },
    setLoseNextBatch(on) {
      settings = { ...settings, loseNextBatch: on };
      emit();
    },
    note(text, tone = 'neutral') {
      log('wizard', text, tone);
      emit();
    },
    reset() {
      seed();
      log('host', 'Archive reset: the original registry, no artworks');
      emit();
    },
  };
}

/** A registry entry's name, for showing a saved artwork's artist or owner */
export function registryName(snapshot: DemoHostSnapshot, id: unknown): string | null {
  if (id === null || id === undefined || id === '') return null;
  return snapshot.registry.find((entry) => entry.id === id)?.name ?? String(id);
}

/**
 * Artworks saved more than once under the same Import Key, counted from the
 * store itself rather than trusted: what a Host App that ignored Import Keys
 * would end up with after a retry.
 */
export function artworksSavedTwice(snapshot: DemoHostSnapshot): number {
  const keys = new Set<string>();
  let twice = 0;
  for (const saved of snapshot.artworks) {
    if (keys.has(saved.importKey)) twice++;
    keys.add(saved.importKey);
  }
  return twice;
}
