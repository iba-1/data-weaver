import { describe, expect, it, vi } from 'vitest';
import { normaliseForMatch, type ImportRow } from '@/components/import-wizard';
import {
  artworksSavedTwice,
  createDemoHostApp,
  CURRENCIES,
  registryName,
  REGISTRY_KIND,
  type DemoArtwork,
} from '../hostApp';

const artwork = (patch: Partial<DemoArtwork> = {}): DemoArtwork => ({
  title: 'Achrome',
  artist: 'reg-1',
  owner: null,
  year: 1958,
  technique: null,
  acquiredOn: null,
  valueAmount: null,
  valueCurrency: null,
  ...patch,
});

let keys = 0;
const row = (patch: Partial<DemoArtwork> = {}, rowIndex = 0): ImportRow<DemoArtwork> => ({
  importKey: `key-${++keys}`,
  rowIndex,
  record: artwork(patch),
});

const newHost = () => createDemoHostApp({ latencyMs: 0 });

describe('the demo Host App', () => {
  describe('saving batches', () => {
    it('saves each row once and answers a repeated Import Key as created without saving it again', async () => {
      const host = newHost();
      const rows = [row({ title: 'Achrome' }), row({ title: 'Linea m 19,93' })];

      expect(await host.adapter.saveBatch(rows)).toEqual(
        rows.map((r) => ({ importKey: r.importKey, status: 'created' }))
      );
      expect(await host.adapter.saveBatch(rows)).toEqual(
        rows.map((r) => ({ importKey: r.importKey, status: 'created' }))
      );

      const snapshot = host.getSnapshot();
      expect(snapshot.artworks.map((a) => a.record.title)).toEqual(['Achrome', 'Linea m 19,93']);
      expect(snapshot.repeatsIgnored).toBe(2);
      expect(snapshot.batchCalls).toBe(2);
      expect(artworksSavedTwice(snapshot)).toBe(0);
    });

    it('is create-only: another row with a saved title and artist is rejected with a reason on the title', async () => {
      const host = newHost();
      await host.adapter.saveBatch([row({ title: 'Achrome', artist: 'reg-1' })]);
      const again = row({ title: ' achrome ', artist: 'reg-1' });
      const otherArtist = row({ title: 'Achrome', artist: 'reg-2' });

      const outcomes = await host.adapter.saveBatch([again, otherArtist]);

      expect(outcomes[0]).toEqual({
        importKey: again.importKey,
        status: 'rejected',
        reason: '" achrome " by Lucio Fontana is already in the collection.',
        field: 'title',
      });
      expect(outcomes[1]).toEqual({ importKey: otherArtist.importKey, status: 'created' });
      expect(host.getSnapshot().artworks).toHaveLength(2);
    });
  });

  describe('the "Refuse a title" switch', () => {
    it('rejects rows with that title (by Normalised Match) only while it is on', async () => {
      const host = newHost();
      host.setRefuseTitle({ enabled: true });
      const untitled = row({ title: 'senza  TITOLO' });
      const titled = row({ title: 'Senza titolo (blu)' });

      const outcomes = await host.adapter.saveBatch([untitled, titled]);

      expect(outcomes[0]).toMatchObject({ importKey: untitled.importKey, status: 'rejected', field: 'title' });
      expect(outcomes[0]).toHaveProperty('reason', expect.stringContaining('does not accept "senza  TITOLO"'));
      expect(outcomes[1]).toEqual({ importKey: titled.importKey, status: 'created' });

      host.setRefuseTitle({ enabled: false });
      expect(await host.adapter.saveBatch([untitled])).toEqual([{ importKey: untitled.importKey, status: 'created' }]);
    });

    it('refuses the title typed in, and nothing when it is empty', async () => {
      const host = newHost();
      host.setRefuseTitle({ enabled: true, title: 'Achrome' });
      expect(await host.adapter.saveBatch([row({ title: 'Achrome' })])).toEqual([
        expect.objectContaining({ status: 'rejected' }),
      ]);

      host.setRefuseTitle({ title: '  ' });
      expect(await host.adapter.saveBatch([row({ title: 'Achrome', artist: 'reg-9' })])).toEqual([
        expect.objectContaining({ status: 'created' }),
      ]);
    });
  });

  describe('the "Lose the next batch\'s answer" switch', () => {
    it('saves the batch, fails the answer once, then turns itself off; the retry saves nothing twice', async () => {
      const host = newHost();
      host.setLoseNextBatch(true);
      const rows = [row({ title: 'Achrome' }), row({ title: 'Corpo d’aria' })];

      await expect(host.adapter.saveBatch(rows)).rejects.toThrow(/connection dropped/i);
      expect(host.getSnapshot().artworks).toHaveLength(2);
      expect(host.getSnapshot().settings.loseNextBatch).toBe(false);

      // Data Weaver sends the same rows again, with the same Import Keys
      expect(await host.adapter.saveBatch(rows)).toEqual(
        rows.map((r) => ({ importKey: r.importKey, status: 'created' }))
      );
      const snapshot = host.getSnapshot();
      expect(snapshot.artworks).toHaveLength(2);
      expect(snapshot.repeatsIgnored).toBe(2);
      expect(artworksSavedTwice(snapshot)).toBe(0);
      expect(snapshot.activity.map((a) => a.text)).toEqual([
        expect.stringMatching(/saveBatch #1 · 2 rows → 2 saved; then the answer was lost/),
        expect.stringMatching(/saveBatch #2 · 2 rows → 0 saved, 2 already saved \(Import Key\)/),
      ]);
    });
  });

  describe('the registry', () => {
    it('answers every value, with both Homonyms, a Possible Match and nothing for a new name', async () => {
      const host = newHost();
      const values = ['mario rossi', 'l. fontana', 'lucio fontana', 'anna bianchi', 'manzoni, piero'].map(normaliseForMatch);

      const answer = await host.adapter.findRelated!(REGISTRY_KIND, values);

      expect(Object.keys(answer).sort()).toEqual([...values].sort());
      expect(answer['mario rossi']).toEqual([
        { id: 'reg-3', name: 'Mario Rossi', description: 'Painter, b. 1950, Bergamo', match: 'normalised' },
        { id: 'reg-4', name: 'Mario Rossi', description: 'Illustrator, b. 1987, Napoli', match: 'normalised' },
      ]);
      expect(answer['l. fontana']).toEqual([
        { id: 'reg-1', name: 'Lucio Fontana', description: 'Artist, 1899–1968', match: 'possible' },
      ]);
      expect(answer['lucio fontana']).toEqual([expect.objectContaining({ id: 'reg-1', match: 'normalised' })]);
      expect(answer['anna bianchi']).toEqual([]);
      expect(answer['manzoni, piero']).toEqual([]);
    });

    it('creates a record once per call, marked as created by an import, and finds it afterwards', async () => {
      const host = newHost();

      const id = await host.adapter.createRelated!(REGISTRY_KIND, 'Anna Bianchi');

      expect(host.getSnapshot().registry.filter((e) => e.createdByImport)).toEqual([
        { id, name: 'Anna Bianchi', createdByImport: true },
      ]);
      const answer = await host.adapter.findRelated!(REGISTRY_KIND, ['anna bianchi']);
      expect(answer['anna bianchi']).toEqual([{ id, name: 'Anna Bianchi', match: 'normalised' }]);
    });

    it('refuses a kind it does not have', async () => {
      const host = newHost();
      await expect(host.adapter.createRelated!('lender', 'Anna Bianchi')).rejects.toThrow('The archive has no lender records.');
      expect(await host.adapter.findRelated!('lender', ['anna bianchi'])).toEqual({ 'anna bianchi': [] });
    });
  });

  it("names a saved artwork's registry entries, with the ID when the name is a Homonym", () => {
    const snapshot = newHost().getSnapshot();
    expect(registryName(snapshot, 'reg-1')).toBe('Lucio Fontana');
    expect(registryName(snapshot, 'reg-4')).toBe('Mario Rossi [reg-4]');
    expect(registryName(snapshot, null)).toBeNull();
  });

  it('loads the currencies it accepts', async () => {
    expect(await newHost().loadCurrencies()).toEqual(CURRENCIES);
  });

  it('tells subscribers about every change, and reset goes back to the original registry', async () => {
    const host = newHost();
    const listener = vi.fn();
    host.subscribe(listener);

    await host.adapter.createRelated!(REGISTRY_KIND, 'Anna Bianchi');
    await host.adapter.saveBatch([row()]);
    host.note('Import finished', 'success');
    expect(listener).toHaveBeenCalledTimes(3);
    const before = host.getSnapshot();

    host.reset();

    const after = host.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.artworks).toEqual([]);
    expect(after.registry.some((e) => e.createdByImport)).toBe(false);
    expect(after.repeatsIgnored).toBe(0);
    expect(after.activity.at(-2)).toMatchObject({ source: 'wizard', text: 'Import finished', tone: 'success' });
  });
});
