import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ImportWizard } from '../ImportWizard';
import type { FieldConfig, ImportReport, ImportWizardProps } from '@/lib/import-wizard/types';
import { createFakeHostApp, type FakeHostApp, type FakeHostAppOptions } from '@/test/fakeHostApp';
import { continueToResolution, importRows } from '@/test/wizardDriver';

vi.mock('@/lib/import-wizard/parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/import-wizard/parser')>();
  return { ...actual, parseFile: vi.fn() };
});

import { parseFile } from '@/lib/import-wizard/parser';

type Key = 'title' | 'author' | 'owner' | 'lender' | 'venue';
type Rec = Record<Key, unknown>;

/** The Host App's Output Shape: author, owner and lender are Registry entries, venue a place */
const FIELDS: FieldConfig<Key>[] = [
  { key: 'title', label: 'Title', type: 'string', required: true, matchKeywords: ['title'] },
  { key: 'author', label: 'Author', type: 'string', relationship: { kind: 'registry' }, matchKeywords: ['author'] },
  { key: 'owner', label: 'Owner', type: 'string', relationship: { kind: 'registry' }, matchKeywords: ['owner'] },
  { key: 'lender', label: 'Lender', type: 'string', relationship: { kind: 'registry' }, matchKeywords: ['lender'] },
  { key: 'venue', label: 'Venue', type: 'string', relationship: { kind: 'place' }, matchKeywords: ['venue'] },
];

const FILE = [
  { Title: 'Achrome', Author: 'Lucio Fontana', Owner: 'Galleria Rossi', Lender: '', Venue: 'Milano' },
  { Title: 'Concetto spaziale', Author: 'lucio  fontana', Owner: 'Niccolò Rossi', Lender: 'Galleria Rossi', Venue: '' },
  { Title: 'Linea', Author: 'Piero Manzoni', Owner: 'Niccolo Rossi', Lender: 'niccolò rossi', Venue: 'milano' },
  { Title: 'Bozza', Author: 'Nessuno', Owner: 'Nessuno', Lender: '', Venue: 'Torino' },
];

/** The Registry already holds Lucio Fontana */
const REGISTRY = { registry: [{ id: 'reg-fontana', name: 'Lucio Fontana', description: '1899–1968' }] };

function mockFile(rows: Record<string, unknown>[] = FILE) {
  vi.mocked(parseFile).mockResolvedValue({ headers: Object.keys(rows[0]), rows, fileName: 'opere.xlsx', fileType: 'excel' });
}

function host(options: FakeHostAppOptions<Rec> = {}): FakeHostApp<Rec> {
  return createFakeHostApp<Rec>({ related: REGISTRY, ...options });
}

function renderWizard(fake: FakeHostApp<Rec>, props: Partial<ImportWizardProps<Rec, Key>> = {}) {
  return render(<ImportWizard<Rec, Key> fields={FIELDS} adapter={fake.adapter} {...props} />);
}

/** The grid row showing row `n` of the file (the header is aria-rowindex 1) */
function gridRow(n: number): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[aria-rowindex="${n + 1}"]`);
  if (!row) throw new Error(`Row ${n} is not rendered`);
  return row;
}

/** Upload the file, go to the review and leave out the given rows (row 4, Bozza, by default) */
async function reviewFile(exclude: number[] = [4]) {
  const input = document.getElementById('file-input') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['x'], 'opere.xlsx')] } });
  });
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: /continue to validation/i }));
  });
  await screen.findByText(/validate data/i);
  for (const n of exclude) fireEvent.click(within(gridRow(n)).getByRole('button', { name: `Exclude row ${n}` }));
}

/** One kind's section of the Resolution step, by its fields' labels */
function kindSection(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

/** The items of one group (e.g. "Will be created (3)") within a kind's section */
function groupItems(section: HTMLElement, group: string): HTMLElement[] {
  return within(within(section).getByRole('region', { name: group })).getAllByRole('listitem');
}

beforeEach(() => {
  vi.mocked(parseFile).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Resolution of Relationship Fields', () => {
  it('looks up each kind once, with the distinct normalised values of all its fields, ignoring Excluded Rows', async () => {
    mockFile();
    const fake = host();
    renderWizard(fake);
    await reviewFile();

    expect(screen.getByText('Link records')).toBeInTheDocument();
    await continueToResolution();

    expect(fake.lookups).toEqual([
      { kind: 'registry', values: ['lucio fontana', 'galleria rossi', 'niccolo rossi', 'piero manzoni'] },
      { kind: 'place', values: ['milano'] },
    ]);
  });

  it('shows every value once, as matched existing or will be created, with its spellings and rows', async () => {
    mockFile();
    const fake = host();
    renderWizard(fake);
    await reviewFile();
    await continueToResolution();

    const registry = kindSection('Author, Owner, Lender');
    const [fontana] = groupItems(registry, 'Matched existing (1)');
    expect(fontana).toHaveTextContent('Lucio Fontana (1899–1968)');
    expect(fontana).toHaveTextContent('Used in 2 rows');
    expect(fontana).toHaveTextContent('In your file: Lucio Fontana ×1, lucio fontana ×1');

    const created = groupItems(registry, 'Will be created (3)');
    expect(created.map((item) => within(item).getByRole('textbox')).map((input) => (input as HTMLInputElement).value)).toEqual([
      'Galleria Rossi',
      // The accented spelling is preferred
      'Niccolò Rossi',
      'Piero Manzoni',
    ]);
    expect(created[1]).toHaveTextContent('Used in 2 rows');
    expect(created[1]).toHaveTextContent('In your file: Niccolò Rossi ×1, Niccolo Rossi ×1, niccolò rossi ×1');
    expect(within(registry).queryByRole('region', { name: /needs a decision/i })).not.toBeInTheDocument();

    const [milano] = groupItems(kindSection('Venue'), 'Will be created (1)');
    expect(within(milano).getByRole('textbox')).toHaveValue('Milano');
    expect(milano).toHaveTextContent('Used in 2 rows');

    // Resolution is only a decision: nothing is created or saved yet
    expect(fake.creates).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it('creates each new record once, one at a time, before any batch, and saves rows with IDs, never names', async () => {
    mockFile();
    const fake = host();
    const onImportFinished = vi.fn<(report: ImportReport<Rec>) => void>();
    renderWizard(fake, { onImportFinished, batchSize: 2 });
    await reviewFile();
    await continueToResolution();

    await importRows();

    // Galleria Rossi is both an owner and a lender, Niccolò Rossi both an owner and a lender: created once each
    expect(fake.log).toEqual([
      'findRelated registry',
      'findRelated place',
      'createRelated registry Galleria Rossi',
      'createRelated registry Niccolò Rossi',
      'createRelated registry Piero Manzoni',
      'createRelated place Milano',
      'saveBatch 1',
      'saveBatch 2',
    ]);
    expect(fake.maxConcurrentCreates).toBe(1);
    const id = (kind: string, name: string) => fake.related.get(kind)!.find((r) => r.name === name)!.id;
    expect(fake.calls.flat().map((row) => row.record)).toEqual([
      { title: 'Achrome', author: 'reg-fontana', owner: id('registry', 'Galleria Rossi'), lender: null, venue: id('place', 'Milano') },
      {
        title: 'Concetto spaziale',
        author: 'reg-fontana',
        owner: id('registry', 'Niccolò Rossi'),
        lender: id('registry', 'Galleria Rossi'),
        venue: null,
      },
      {
        title: 'Linea',
        author: id('registry', 'Piero Manzoni'),
        owner: id('registry', 'Niccolò Rossi'),
        lender: id('registry', 'Niccolò Rossi'),
        venue: id('place', 'Milano'),
      },
    ]);
    expect(fake.related.get('registry')).toHaveLength(4);
    expect(screen.getByText('3 imported')).toBeInTheDocument();
    expect(onImportFinished.mock.calls[0][0].excluded.map((row) => row.rowIndex)).toEqual([3]);
  });

  it('uses the name the Importer gives a new record, and blocks the import while a name is empty', async () => {
    mockFile();
    const fake = host();
    renderWizard(fake);
    await reviewFile();
    await continueToResolution();

    const name = screen.getByRole('textbox', { name: 'Name of the new record for Piero Manzoni' });
    fireEvent.change(name, { target: { value: '  ' } });
    expect(screen.getByText('Enter a name for the new record.')).toBeInTheDocument();
    expect(screen.getByText('Give every new record a name before you can import.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete import/i })).toBeDisabled();

    fireEvent.change(name, { target: { value: 'Piero Manzoni (artista)' } });
    expect(screen.getByRole('button', { name: /complete import/i })).toBeEnabled();
    await importRows();

    expect(fake.creates).toContainEqual({ kind: 'registry', name: 'Piero Manzoni (artista)' });
    expect(fake.creates.map((c) => c.name)).not.toContain('Piero Manzoni');
  });

  it('creates nothing when the import is abandoned in Resolution', async () => {
    mockFile();
    const fake = host();
    const { unmount } = renderWizard(fake);
    await reviewFile();
    await continueToResolution();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Review' }));
    await continueToResolution();
    unmount();

    expect(fake.creates).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it('rejects the rows pointing to a record that could not be created, naming it, and saves the others', async () => {
    mockFile();
    const fake = host({ failCreate: (_kind, name) => (name === 'Galleria Rossi' ? 'Registry is read-only' : null) });
    const onImportFinished = vi.fn<(report: ImportReport<Rec>) => void>();
    renderWizard(fake, { onImportFinished });
    await reviewFile();
    await continueToResolution();

    await importRows();

    // The other new records are still created, and the rows not depending on Galleria Rossi saved
    expect(fake.creates.map((c) => c.name)).toEqual(['Galleria Rossi', 'Niccolò Rossi', 'Piero Manzoni', 'Milano']);
    expect(fake.calls.flat().map((row) => row.record.title)).toEqual(['Linea']);
    expect(screen.getByText('1 imported')).toBeInTheDocument();
    expect(screen.getByText('2 rejected')).toBeInTheDocument();
    const reason = 'The record "Galleria Rossi" could not be created: Registry is read-only';
    const rejected = within(screen.getByRole('region', { name: 'Rejected rows' }))
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
    expect(rejected).toEqual([
      ['1', 'Achrome', 'Owner', reason],
      ['2', 'Concetto spaziale', 'Lender', reason],
    ]);
    const [report] = onImportFinished.mock.calls[0];
    expect(report.rejected.map((row) => [row.rowIndex, row.cause, row.field])).toEqual([
      [0, 'relatedNotCreated', 'owner'],
      [1, 'relatedNotCreated', 'lender'],
    ]);
    // Rows never sent keep the names the Importer reviewed
    expect(report.rejected[0].record.owner).toBe('Galleria Rossi');
  });

  it('never decides Homonyms or Possible Matches: they need a decision and block the import', async () => {
    mockFile([
      { Title: 'Achrome', Author: 'Anna Bianchi', Owner: '', Lender: '', Venue: '' },
      { Title: 'Linea', Author: 'L. Fontana', Owner: '', Lender: '', Venue: '' },
      { Title: 'Bozza', Author: 'Piero Manzoni', Owner: '', Lender: '', Venue: '' },
      { Title: 'Senza titolo', Author: 'Piero Manzoni', Owner: '', Lender: '', Venue: '' },
    ]);
    const fake = host({
      related: {
        registry: [
          ...REGISTRY.registry,
          { id: 'reg-anna-1', name: 'Anna Bianchi', description: '1950' },
          { id: 'reg-anna-2', name: 'Anna Bianchi', description: '1978' },
        ],
      },
      possible: (_kind, value, record) => value === 'l. fontana' && record.name === 'Lucio Fontana',
    });
    renderWizard(fake);
    await reviewFile();
    await continueToResolution();

    const registry = kindSection('Author, Owner, Lender');
    const [anna] = groupItems(registry, 'Several matches (1)');
    expect(anna).toHaveTextContent('2 records have this name:');
    expect(anna).toHaveTextContent('Anna Bianchi (1950)');
    expect(anna).toHaveTextContent('Anna Bianchi (1978)');
    expect(within(anna).getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
    const [fontana] = groupItems(registry, 'Needs a decision (1)');
    expect(fontana).toHaveTextContent('Might be the same as:');
    expect(fontana).toHaveTextContent('Lucio Fontana (1899–1968)');
    expect(screen.getByText('2 names need a decision before you can import.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete import/i })).toBeDisabled();

    // Back in the review, leave those rows out: they no longer need a decision
    fireEvent.click(screen.getByRole('button', { name: 'Back to Review' }));
    fireEvent.click(within(gridRow(1)).getByRole('button', { name: 'Exclude row 1' }));
    fireEvent.click(within(gridRow(2)).getByRole('button', { name: 'Exclude row 2' }));
    await continueToResolution();

    expect(screen.queryByRole('region', { name: /needs a decision/i })).not.toBeInTheDocument();
    await importRows();
    expect(fake.creates).toEqual([{ kind: 'registry', name: 'Piero Manzoni' }]);
    // Row 4 was left out on the way to the review
    expect(fake.calls.flat().map((row) => row.rowIndex)).toEqual([2]);
  });

  it('after Resolution, the grid keeps the file’s text with a badge naming the resolved record', async () => {
    mockFile();
    const fake = host();
    renderWizard(fake);
    await reviewFile();
    await continueToResolution();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Review' }));
    await screen.findByText(/validate data/i);

    const second = gridRow(2);
    // The file's spelling, and the existing record it is linked to
    expect(within(second).getByText('lucio fontana', { normalizer: (t) => t.replace(/\s+/g, ' ') })).toBeInTheDocument();
    expect(within(second).getByText('Lucio Fontana')).toBeInTheDocument();
    // New records show the name they will be created with
    expect(within(second).getByText('Niccolò Rossi')).toBeInTheDocument();
    expect(within(second).getByText('New: Niccolò Rossi')).toBeInTheDocument();
    expect(within(second).getByText('New: Galleria Rossi')).toBeInTheDocument();
  });

  it('re-resolves after changes in the review, looking up only values not seen before', async () => {
    mockFile();
    const fake = host();
    renderWizard(fake);
    await reviewFile();
    await continueToResolution();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of the new record for Galleria Rossi' }), {
      target: { value: 'Galleria Rossi & C.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back to Review' }));
    await screen.findByText(/validate data/i);
    // Rename row 3's author: its old badge goes, as its name is not resolved yet
    fireEvent.click(within(gridRow(3)).getByText('Piero Manzoni'));
    const input = screen.getByDisplayValue('Piero Manzoni');
    fireEvent.change(input, { target: { value: 'Alberto Burri' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(within(gridRow(3)).queryByText('New: Piero Manzoni')).not.toBeInTheDocument();
    await continueToResolution();

    expect(fake.lookups).toEqual([
      { kind: 'registry', values: ['lucio fontana', 'galleria rossi', 'niccolo rossi', 'piero manzoni'] },
      { kind: 'place', values: ['milano'] },
      { kind: 'registry', values: ['alberto burri'] },
    ]);
    const created = groupItems(kindSection('Author, Owner, Lender'), 'Will be created (3)');
    expect(created.map((item) => (within(item).getByRole('textbox') as HTMLInputElement).value)).toEqual([
      // The Importer's name is kept
      'Galleria Rossi & C.',
      'Niccolò Rossi',
      'Alberto Burri',
    ]);
  });

  it('shows a failed lookup with a retry, and looks up again only the kind that failed', async () => {
    mockFile();
    const fake = host();
    fake.onLookup(1, { fail: new Error('Registry offline') });
    const onEvent = vi.fn();
    renderWizard(fake, { onEvent });
    await reviewFile();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /link related records/i }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not look up Author, Owner, Lender: Registry offline');
    expect(screen.queryByRole('button', { name: /complete import/i })).not.toBeInTheDocument();
    expect(onEvent).toHaveBeenCalledWith({ type: 'ERROR', error: 'Could not look up Author, Owner, Lender: Registry offline' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    await screen.findByRole('region', { name: 'Author, Owner, Lender' });
    expect(fake.lookups.map((l) => l.kind)).toEqual(['registry', 'place', 'registry']);
  });

  it('refuses a lookup answer that leaves values out, rather than creating duplicates', async () => {
    mockFile();
    const fake = host();
    fake.onLookup(1, { answer: () => ({}) });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWizard(fake);
    await reviewFile();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /link related records/i }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not look up Author, Owner, Lender: The answer could not be read.'
    );
    expect(consoleError.mock.calls.join('\n')).toMatch(/findRelated gave no candidates list for "lucio fontana"/);
  });
});

describe('Homonyms: several existing records with the same name', () => {
  /** Three artworks by "Mario Rossi"; the Registry holds two, b. 1950 and b. 1987 */
  const ROSSI_FILE = [
    { Title: 'Achrome', Author: 'Mario Rossi', Owner: '', Lender: '', Venue: '' },
    { Title: 'Linea', Author: 'mario rossi', Owner: 'Lucio Fontana', Lender: 'Mario Rossi', Venue: '' },
    { Title: 'Bozza', Author: 'Mario  Rossi', Owner: '', Lender: '', Venue: '' },
  ];
  const ROSSI_REGISTRY = {
    registry: [
      ...REGISTRY.registry,
      { id: 'reg-rossi-1950', name: 'Mario Rossi', description: 'b. 1950' },
      { id: 'reg-rossi-1987', name: 'Mario Rossi', description: 'b. 1987' },
    ],
  };

  async function resolveRossi(props: Partial<ImportWizardProps<Rec, Key>> = {}) {
    mockFile(ROSSI_FILE);
    const fake = host({ related: ROSSI_REGISTRY });
    renderWizard(fake, props);
    await reviewFile([]);
    await continueToResolution();
    return fake;
  }

  /** The Mario Rossi item of the "Several matches" group */
  function rossiItem(): HTMLElement {
    const [item] = groupItems(kindSection('Author, Owner, Lender'), 'Several matches (1)');
    return item;
  }

  /** Choose for the whole value */
  function choose(name: string) {
    fireEvent.click(within(rossiItem()).getByRole('radio', { name }));
  }

  /** Choose for one row, in the per-row panel */
  function chooseForRow(row: number, option: string) {
    const select = screen.getByRole('combobox', { name: `Record for Mario Rossi in row ${row}` }) as HTMLSelectElement;
    const { value } = within(select).getByRole('option', { name: option }) as HTMLOptionElement;
    fireEvent.change(select, { target: { value } });
  }

  function openPerRow() {
    fireEvent.click(within(rossiItem()).getByRole('button', { name: 'Choose for each row (3 rows)' }));
  }

  const importButton = () => screen.getByRole('button', { name: /complete import/i });
  const authors = (fake: FakeHostApp<Rec>) => fake.calls.flat().map((row) => row.record.author);
  /** The ID of the one record created during the test */
  const createdId = (fake: FakeHostApp<Rec>) => fake.related.get('registry')!.find((r) => !String(r.id).startsWith('reg-'))!.id;

  it('lists the value once in a "Several matches" group, with each candidate’s details, and blocks the import', async () => {
    const fake = await resolveRossi();

    const item = rossiItem();
    expect(item).toHaveTextContent('Mario Rossi');
    expect(item).toHaveTextContent('Used in 3 rows');
    expect(item).toHaveTextContent('2 records have this name:');
    expect(within(item).getByRole('radiogroup', { name: 'Which record is Mario Rossi?' })).toBeInTheDocument();
    expect(within(item).getAllByRole('radio')).toHaveLength(3);
    expect(within(item).getByRole('radio', { name: 'Mario Rossi (b. 1950)' })).toHaveAttribute('aria-checked', 'false');
    expect(within(item).getByRole('radio', { name: 'Mario Rossi (b. 1987)' })).toHaveAttribute('aria-checked', 'false');
    expect(within(item).getByRole('radio', { name: 'Create a new record' })).toHaveAttribute('aria-checked', 'false');
    // The other groups are still shown in full
    expect(groupItems(kindSection('Author, Owner, Lender'), 'Matched existing (1)')[0]).toHaveTextContent('Lucio Fontana');

    expect(screen.getByText('1 name needs a decision before you can import.')).toBeInTheDocument();
    expect(importButton()).toBeDisabled();
    expect(fake.lookups).toEqual([{ kind: 'registry', values: ['mario rossi', 'lucio fontana'] }]);
  });

  it('links every row to the candidate the Importer picks, and keeps the value in its group', async () => {
    const fake = await resolveRossi();

    choose('Mario Rossi (b. 1987)');
    expect(within(rossiItem()).getByRole('radio', { name: 'Mario Rossi (b. 1987)' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText(/needs? a decision before you can import/)).not.toBeInTheDocument();
    expect(importButton()).toBeEnabled();

    await importRows();
    expect(fake.creates).toEqual([]);
    expect(fake.calls.flat().map((row) => [row.record.author, row.record.lender])).toEqual([
      ['reg-rossi-1987', null],
      ['reg-rossi-1987', 'reg-rossi-1987'],
      ['reg-rossi-1987', null],
    ]);
  });

  it('creates exactly one new record for "create new", with a name the Importer can change', async () => {
    const fake = await resolveRossi();

    choose('Create a new record');
    const name = within(rossiItem()).getByRole('textbox', { name: 'Name of the new record for Mario Rossi' });
    expect(name).toHaveValue('Mario Rossi');
    fireEvent.change(name, { target: { value: ' ' } });
    expect(screen.getByText('Give every new record a name before you can import.')).toBeInTheDocument();
    expect(importButton()).toBeDisabled();
    fireEvent.change(name, { target: { value: 'Mario Rossi (b. 2001)' } });

    await importRows();
    expect(fake.creates).toEqual([{ kind: 'registry', name: 'Mario Rossi (b. 2001)' }]);
    const created = createdId(fake);
    expect(authors(fake)).toEqual([created, created, created]);
  });

  it('lets the Importer assign individual rows to a different record, and blocks until every row is decided', async () => {
    const fake = await resolveRossi();

    openPerRow();
    const panel = within(rossiItem()).getByRole('list', { name: 'Choose for each row (3 rows)' });
    // Each row with enough context to decide: its number and first field
    expect(within(panel).getAllByRole('listitem').map((row) => row.firstChild?.textContent)).toEqual([
      'Row 1: Achrome',
      'Row 2: Linea',
      'Row 3: Bozza',
    ]);
    expect(
      within(screen.getByRole('combobox', { name: 'Record for Mario Rossi in row 1' }))
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Same as above', 'Mario Rossi (b. 1950)', 'Mario Rossi (b. 1987)', 'Create a new record']);

    // Rows chosen individually, but row 3 not yet: still blocked
    chooseForRow(1, 'Mario Rossi (b. 1950)');
    chooseForRow(2, 'Mario Rossi (b. 1987)');
    expect(screen.getByText('1 name needs a decision before you can import.')).toBeInTheDocument();
    expect(importButton()).toBeDisabled();

    chooseForRow(3, 'Create a new record');
    expect(within(rossiItem()).getByText('3 rows chosen individually')).toBeInTheDocument();
    expect(importButton()).toBeEnabled();
    // A row creating a new record: its name can be set
    expect(within(rossiItem()).getByRole('textbox', { name: 'Name of the new record for Mario Rossi' })).toHaveValue(
      'Mario Rossi'
    );

    await importRows();
    expect(fake.creates).toEqual([{ kind: 'registry', name: 'Mario Rossi' }]);
    expect(fake.calls.flat().map((row) => [row.record.author, row.record.lender])).toEqual([
      ['reg-rossi-1950', null],
      // Every field of the row using the value follows the row's choice
      ['reg-rossi-1987', 'reg-rossi-1987'],
      [createdId(fake), null],
    ]);
  });

  it('creates one record for all the rows assigned to "create new", whether by the value or individually', async () => {
    const fake = await resolveRossi();

    choose('Create a new record');
    openPerRow();
    chooseForRow(2, 'Mario Rossi (b. 1950)');
    chooseForRow(3, 'Create a new record');

    await importRows();
    expect(fake.creates).toEqual([{ kind: 'registry', name: 'Mario Rossi' }]);
    const created = createdId(fake);
    expect(authors(fake)).toEqual([created, 'reg-rossi-1950', created]);
  });

  it('keeps the decisions when the Importer goes back to the review and returns, and badges each row', async () => {
    const fake = await resolveRossi();
    choose('Mario Rossi (b. 1987)');
    openPerRow();
    chooseForRow(1, 'Create a new record');

    fireEvent.click(screen.getByRole('button', { name: 'Back to Review' }));
    await screen.findByText(/validate data/i);
    // Each row's badge says which Mario Rossi it is
    expect(within(gridRow(1)).getByText('New: Mario Rossi')).toBeInTheDocument();
    expect(within(gridRow(2)).getAllByText('Mario Rossi (b. 1987)')).toHaveLength(2);
    expect(within(gridRow(3)).getByText('Mario Rossi (b. 1987)')).toBeInTheDocument();

    await continueToResolution();
    expect(within(rossiItem()).getByRole('radio', { name: 'Mario Rossi (b. 1987)' })).toHaveAttribute('aria-checked', 'true');
    // The per-row choices are open, as a row has one
    const row1 = screen.getByRole('combobox', { name: 'Record for Mario Rossi in row 1' }) as HTMLSelectElement;
    expect(row1.selectedOptions[0].textContent).toBe('Create a new record');
    expect(fake.lookups).toHaveLength(1);

    await importRows();
    expect(authors(fake)).toEqual([createdId(fake), 'reg-rossi-1987', 'reg-rossi-1987']);
  });

  it('ignores a row’s choice once the row no longer uses the value', async () => {
    const fake = await resolveRossi();
    choose('Mario Rossi (b. 1950)');
    openPerRow();
    chooseForRow(3, 'Mario Rossi (b. 1987)');

    // Row 3 is left out: its choice no longer counts, and the others keep the value's
    fireEvent.click(screen.getByRole('button', { name: 'Back to Review' }));
    fireEvent.click(within(gridRow(3)).getByRole('button', { name: 'Exclude row 3' }));
    await continueToResolution();
    expect(rossiItem()).toHaveTextContent('Used in 2 rows');
    expect(within(rossiItem()).queryByText(/chosen individually/)).not.toBeInTheDocument();

    await importRows();
    expect(authors(fake)).toEqual(['reg-rossi-1950', 'reg-rossi-1950']);
  });
});
