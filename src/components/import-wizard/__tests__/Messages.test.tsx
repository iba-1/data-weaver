import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ImportWizard } from '../ImportWizard';
import { createFakeHostApp, type FakeHostApp } from '@/test/fakeHostApp';
import { readSheet } from '@/test/spreadsheet';
import { WizardRoot } from '../WizardRoot';
import { FileUploader } from '../FileUploader';
import { DEFAULT_MESSAGES, type PartialMessageCatalogue } from '@/lib/import-wizard/messages';
import type { AiEditHandler, ChoiceOption, FieldConfig, ImportWizardEvent } from '@/lib/import-wizard/types';

vi.mock('@/lib/import-wizard/parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/import-wizard/parser')>();
  return { ...actual, parseFile: vi.fn() };
});

import { parseFile } from '@/lib/import-wizard/parser';

type Key = 'title' | 'acquired' | 'currency';
type Rec = Record<Key, unknown>;

const CURRENCIES: ChoiceOption[] = [
  { value: 'EUR', label: 'Euro' },
  { value: 'USD', label: 'US dollar' },
];

/** The Host App's Output Shape; its labels are its own text, already in the Importer's language */
function outputShape(currencyOptions: FieldConfig['options'] = CURRENCIES): FieldConfig<Key>[] {
  return [
    { key: 'title', label: 'Titolo', type: 'string', required: true, matchKeywords: ['titolo'] },
    { key: 'acquired', label: 'Acquisito', type: 'date', matchKeywords: ['acquisito'] },
    { key: 'currency', label: 'Valuta', type: 'choice', options: currencyOptions, matchKeywords: ['valuta'] },
  ];
}

function mockFile(rows: Record<string, unknown>[], fileName = 'opere.xlsx') {
  vi.mocked(parseFile).mockResolvedValue({
    headers: rows.length ? Object.keys(rows[0]) : [],
    rows,
    fileName,
    fileType: 'excel',
  });
}

async function upload(fileName = 'opere.xlsx') {
  const input = document.getElementById('file-input') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['x'], fileName)] } });
  });
}

async function continueToReview(name: RegExp | string = /continue to validation/i) {
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name }));
  });
}

/** The grid row showing row `n` of the file (the header is aria-rowindex 1) */
function gridRow(n: number): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[aria-rowindex="${n + 1}"]`);
  if (!row) throw new Error(`Row ${n} is not rendered`);
  return row;
}

/** Open the tooltip of the row status icon, as keyboard focus would */
async function statusTooltip(n: number): Promise<HTMLElement> {
  const trigger = within(gridRow(n)).getAllByRole('button')[1];
  act(() => {
    fireEvent.focus(trigger);
  });
  return screen.findByRole('tooltip');
}

const THREE_ROWS = [
  { Titolo: 'Achrome', Acquisito: '2024-01-15', Valuta: 'Euro' },
  { Titolo: '', Acquisito: '2024-02-01', Valuta: 'eur' },
  { Titolo: 'Concetto spaziale', Acquisito: '', Valuta: 'dollari' },
];

beforeEach(() => {
  vi.mocked(parseFile).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('message catalogue', () => {
  it('shows the Host App’s text in place of the English defaults, and English for the rest', () => {
    render(
      <ImportWizard
        adapter={createFakeHostApp().adapter}
        fields={outputShape()}
        messages={{
          steps: { upload: 'Carica' },
          upload: { chooseFile: 'Scegli un file', accepted: 'Formati: {types} (max {maxSize})' },
        }}
      />
    );

    expect(screen.getByText('Carica')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scegli un file' })).toBeInTheDocument();
    expect(screen.getByText('Formati: .csv, .xlsx, .xls (max 10 MB)')).toBeInTheDocument();
    // Missing keys fall back to English
    expect(screen.getByText('Match columns')).toBeInTheDocument();
    expect(screen.getByText('Drag and drop a file here')).toBeInTheDocument();
  });

  it('gives function entries their parameters, so the Host App can apply its plural rules', async () => {
    mockFile(THREE_ROWS);
    const plural = (count: number, one: string, other: string) => (count === 1 ? one : `${count} ${other}`);
    render(
      <ImportWizard<Rec, Key>
        adapter={createFakeHostApp().adapter}
        fields={outputShape()}
        messages={{
          review: {
            rowCount: ({ count }) => plural(count, 'una riga', 'righe'),
            filterErrors: ({ count }) => plural(count, 'un errore', 'errori'),
            complete: ({ count }) => `Importa ${plural(count, 'una riga', 'righe')}`,
          },
          search: { matchCount: '{count} trovati' },
        }}
      />
    );
    await upload();
    await continueToReview();

    expect(await screen.findByText('3 righe')).toBeInTheDocument();
    expect(screen.getByText('2 errori')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importa una riga' })).toBeDisabled();

    // Exclude a row with an error: the counts follow
    fireEvent.click(within(gridRow(3)).getByRole('button', { name: /exclude row 3/i }));
    expect(screen.getByText('un errore')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search in data/i), { target: { value: 'Achrome' } });
    expect(screen.getByText('1 trovati')).toBeInTheDocument();
    // Not overridden: English, with its parameters
    expect(screen.getByText('1 of 3 rows')).toBeInTheDocument();
  });

  it('translates the validation messages Data Weaver raises, and shows the Host App’s own as written', async () => {
    mockFile(THREE_ROWS);
    const onEvent = vi.fn<(event: ImportWizardEvent<Rec>) => void>();
    render(
      <ImportWizard<Rec, Key>
        adapter={createFakeHostApp().adapter}
        fields={outputShape()}
        validateRow={(data) => (data.title === 'Concetto spaziale' ? [{ type: 'error', message: 'Opera già presente' }] : [])}
        onEvent={onEvent}
        messages={{
          validation: {
            required: '{field} è obbligatorio',
            notAnOption: ({ field, options }) => `${field}: scegli tra ${options}`,
          },
        }}
      />
    );
    await upload();
    await continueToReview();
    await screen.findByText(/validate data/i);

    expect(await statusTooltip(2)).toHaveTextContent('Titolo è obbligatorio');
    expect(screen.getByRole('combobox', { name: 'Valuta, row 3' })).toHaveAccessibleDescription(
      'Valuta: scegli tra Euro, US dollar'
    );
    expect(await statusTooltip(3)).toHaveTextContent('Valuta: scegli tra Euro, US dollar, Opera già presente');

    // The Host App hears the English text plus the key and parameters, to translate as it likes
    const validated = onEvent.mock.calls.map(([e]) => e).find((e) => e.type === 'DATA_VALIDATED');
    expect(validated?.type === 'DATA_VALIDATED' && validated.rows[1].errors).toEqual([
      { field: 'title', message: 'Titolo is required', messageRef: { key: 'required', params: { field: 'Titolo' } } },
    ]);
  });

  it('refuses an upload in the Host App’s language', async () => {
    render(
      <ImportWizard
        adapter={createFakeHostApp().adapter}
        fields={outputShape()}
        messages={{ upload: { unsupportedType: ({ fileName, types }) => `${fileName} non è supportato. Formati: ${types}` } }}
      />
    );

    await upload('opere.pdf');

    expect(screen.getByText('opere.pdf non è supportato. Formati: .csv, .xlsx, .xls')).toBeInTheDocument();
  });

  it('reports a failed options loader in the Host App’s language, on screen and in the ERROR event', async () => {
    mockFile(THREE_ROWS);
    const onEvent = vi.fn<(event: ImportWizardEvent<Rec>) => void>();
    render(
      <ImportWizard<Rec, Key>
        adapter={createFakeHostApp().adapter}
        fields={outputShape(() => Promise.reject(new Error('503')))}
        onEvent={onEvent}
        messages={{ options: { loadFailed: 'Impossibile caricare le opzioni di {field} ({reason})', retry: 'Riprova' } }}
      />
    );
    await upload();
    await continueToReview();

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossibile caricare le opzioni di Valuta (503)');
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument();
    expect(onEvent).toHaveBeenCalledWith({ type: 'ERROR', error: 'Impossibile caricare le opzioni di Valuta (503)' });
  });

  it('reaches step components used on their own, through WizardRoot', () => {
    render(
      <WizardRoot messages={{ upload: { chooseFile: 'Scegli un file' } }}>
        <FileUploader onFileSelected={() => {}} />
      </WizardRoot>
    );

    expect(screen.getByRole('button', { name: 'Scegli un file' })).toBeInTheDocument();
    expect(screen.getByText('Drag and drop a file here')).toBeInTheDocument();
  });

  it('lets an inner WizardRoot override some entries of the enclosing catalogue', () => {
    render(
      <WizardRoot messages={{ upload: { chooseFile: 'Scegli un file', dragAndDrop: 'Trascina qui' } }}>
        <WizardRoot messages={{ upload: { chooseFile: 'Sfoglia' } }}>
          <FileUploader onFileSelected={() => {}} />
        </WizardRoot>
      </WizardRoot>
    );

    expect(screen.getByRole('button', { name: 'Sfoglia' })).toBeInTheDocument();
    expect(screen.getByText('Trascina qui')).toBeInTheDocument();
  });
});

/**
 * Every entry of the catalogue replaced by a marker: any text the Importer can
 * see that has no marker, and is not the Importer's data or the Host App's own
 * text, was hard-coded.
 */
describe('every piece of text the Importer sees comes from the catalogue', () => {
  const MARKED = Object.fromEntries(
    Object.entries(DEFAULT_MESSAGES).map(([group, entries]) => [
      group,
      Object.fromEntries(Object.keys(entries).map((key) => [key, () => `⟦${group}.${key}⟧`])),
    ])
  ) as PartialMessageCatalogue;

  /** The Importer's data and the Host App's own text (field labels, options, its validators' messages) */
  const OWN_TEXT = new Set([
    'Titolo', 'Acquisito', 'Valuta', 'Note',
    'Achrome', 'Concetto spaziale', 'Nature morte', 'dollari', 'ieri', 'bozza',
    'Euro', 'EUR', 'US dollar', 'USD',
    'Opera già presente', 'Servizio non disponibile',
  ]);
  // Dates are shown as YYYY-MM-DD: no letters, so they need no allowance

  const LABELLING_ATTRIBUTES = ['aria-label', 'placeholder', 'title', 'alt', 'aria-description'];

  /** Visible or announced text with letters in it that is neither marked nor the Importer's or Host App's own */
  function unmarkedText(): string[] {
    const found: string[] = [];
    const check = (text: string | null | undefined) => {
      const trimmed = text?.trim();
      if (!trimmed || !/\p{L}/u.test(trimmed) || trimmed.includes('⟦') || OWN_TEXT.has(trimmed)) return;
      found.push(trimmed);
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      // CSS that Radix injects is not text
      acceptNode: (node) =>
        node.parentElement?.closest('style, script') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) check(node.textContent);
    for (const element of document.body.querySelectorAll('*')) {
      for (const attribute of LABELLING_ATTRIBUTES) check(element.getAttribute(attribute));
    }
    return found;
  }

  function expectAllMarked() {
    expect(unmarkedText()).toEqual([]);
  }

  const REVIEW_ROWS = [
    { Titolo: 'Achrome', Acquisito: '2024-01-15', Valuta: 'Euro' },
    { Titolo: '', Acquisito: 'ieri', Valuta: 'dollari' },
    { Titolo: 'Concetto spaziale', Acquisito: '', Valuta: '' },
    { Titolo: 'Nature morte', Acquisito: '', Valuta: 'EUR' },
  ];

  function renderMarked(
    props: { fields?: FieldConfig<Key>[]; aiEdit?: AiEditHandler; host?: FakeHostApp<Rec>; batchSize?: number } = {}
  ) {
    return render(
      <ImportWizard<Rec, Key>
        adapter={(props.host ?? createFakeHostApp<Rec>()).adapter}
        batchSize={props.batchSize}
        retry={{ baseDelayMs: 0 }}
        fields={props.fields ?? outputShape()}
        aiEdit={props.aiEdit}
        validateRow={(data) => (data.title === 'Nature morte' ? [{ type: 'warning', message: 'Opera già presente' }] : [])}
        messages={MARKED}
      />
    );
  }

  async function reviewMarked(props: Parameters<typeof renderMarked>[0] = {}) {
    mockFile(REVIEW_ROWS);
    renderMarked(props);
    await upload();
    await continueToReview('⟦mapping.continue⟧');
    await screen.findByText('⟦review.title⟧');
  }

  it('in the upload step, including refused and unreadable files', async () => {
    renderMarked();
    expectAllMarked();

    await upload('opere.pdf');
    expect(screen.getByText('⟦upload.unsupportedType⟧')).toBeInTheDocument();
    expectAllMarked();

    vi.mocked(parseFile).mockRejectedValue(new Error('Corrupted zip'));
    await upload();
    expect(screen.getByText('⟦upload.unreadable⟧')).toBeInTheDocument();
    expectAllMarked();

    mockFile([]);
    await upload();
    expect(screen.getByText('⟦upload.empty⟧')).toBeInTheDocument();
    expectAllMarked();
  });

  it('in column matching, with a required field unmatched and a picker open', async () => {
    mockFile([{ Acquisito: '2024-01-15', Valuta: 'Euro', Note: 'bozza' }]);
    renderMarked();
    await upload();

    expect(screen.getByText('⟦mapping.missingRequired⟧')).toBeInTheDocument();
    expect(screen.getAllByText('⟦mapping.autoBadge⟧')).toHaveLength(2);
    expectAllMarked();

    fireEvent.click(screen.getAllByRole('combobox')[2]);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expectAllMarked();
  });

  it('while choice options load and when they fail', async () => {
    let rejectOptions!: (error: Error) => void;
    mockFile(REVIEW_ROWS);
    renderMarked({ fields: outputShape(() => new Promise((_, reject) => (rejectOptions = reject))) });
    await upload();
    await continueToReview('⟦mapping.continue⟧');

    expect(screen.getByRole('status')).toHaveTextContent('⟦options.loading⟧');
    expectAllMarked();

    await act(async () => rejectOptions(new Error('Servizio non disponibile')));
    expect(screen.getByRole('alert')).toHaveTextContent('⟦options.loadFailed⟧');
    expectAllMarked();
  });

  it('in the review grid: counts, filters, row states, tooltips and cell editors', async () => {
    await reviewMarked();
    expectAllMarked();

    // Tooltips: row status (Data Weaver's validation messages), exclude, toolbar, undo/redo
    for (const n of [2, 4]) {
      await statusTooltip(n);
      expectAllMarked();
    }
    for (const button of [
      within(gridRow(1)).getAllByRole('button')[0],
      screen.getByRole('button', { name: '⟦review.excludeErrors⟧' }),
      screen.getByRole('button', { name: '⟦review.fillRequired⟧' }),
      screen.getByRole('button', { name: '⟦review.undo⟧' }),
      screen.getByRole('button', { name: '⟦review.redo⟧' }),
    ]) {
      act(() => {
        fireEvent.focus(button);
      });
      await screen.findByRole('tooltip');
      expectAllMarked();
    }

    // An Excluded Row, its tooltip, and the excluded count
    fireEvent.click(within(gridRow(1)).getAllByRole('button')[0]);
    expect(screen.getByText('⟦review.excludedCount⟧')).toBeInTheDocument();
    act(() => {
      fireEvent.focus(within(gridRow(1)).getAllByRole('button')[0]);
    });
    await screen.findByRole('tooltip');
    expectAllMarked();

    // Search with matches, then without; a filter with no rows
    const search = screen.getByPlaceholderText('⟦search.placeholder⟧');
    fireEvent.change(search, { target: { value: 'Achrome' } });
    expect(screen.getByText('⟦search.matchCount⟧')).toBeInTheDocument();
    expect(screen.getByText('⟦review.rowCountFiltered⟧')).toBeInTheDocument();
    expectAllMarked();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('⟦review.noSearchMatches⟧')).toBeInTheDocument();
    expectAllMarked();
    fireEvent.click(screen.getByRole('button', { name: '⟦search.clear⟧' }));
    fireEvent.click(screen.getByText('⟦review.filterWarnings⟧'));
    fireEvent.click(screen.getByRole('button', { name: '⟦review.excludeErrors⟧' }));
    fireEvent.click(screen.getByText('⟦review.filterErrors⟧'));
    expect(screen.getByText('⟦review.noFilterMatches⟧')).toBeInTheDocument();
    expectAllMarked();
    fireEvent.click(screen.getByText('⟦review.filterValid⟧'));

    // A text cell being edited, and a choice cell's picker
    fireEvent.click(screen.getByText('Achrome'));
    expect(screen.getByRole('button', { name: '⟦cell.save⟧' })).toBeInTheDocument();
    expectAllMarked();
    fireEvent.keyDown(screen.getByDisplayValue('Achrome'), { key: 'Escape' });
    fireEvent.click(screen.getAllByRole('combobox', { name: '⟦review.cellLabel⟧' })[0]);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '⟦cell.clear⟧' })).toBeInTheDocument();
    expectAllMarked();
  });

  it('in Fill Required, find and replace, export and AI Edit', async () => {
    const aiEdit = vi
      .fn<AiEditHandler>()
      .mockResolvedValueOnce(Array.from({ length: 7 }, (_, rowIndex) => ({ rowIndex, changes: { title: 'Achrome' } })))
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce('timeout')
      .mockRejectedValueOnce(new Error('Servizio non disponibile'));
    await reviewMarked({ aiEdit });

    // Fill Required writes the catalogue's placeholder into empty required cells
    fireEvent.click(screen.getByRole('button', { name: '⟦review.fillRequired⟧' }));
    expect(within(gridRow(2)).getByText('⟦review.fillPlaceholder⟧')).toBeInTheDocument();
    expectAllMarked();

    // Find and replace: matches, no matches, replaced
    fireEvent.click(screen.getByRole('button', { name: '⟦findReplace.open⟧' }));
    const dialog = screen.getByRole('dialog');
    expectAllMarked();
    fireEvent.change(within(dialog).getByLabelText('⟦findReplace.find⟧'), { target: { value: 'zzz' } });
    expect(within(dialog).getByText('⟦findReplace.noMatches⟧')).toBeInTheDocument();
    expectAllMarked();
    fireEvent.change(within(dialog).getByLabelText('⟦findReplace.find⟧'), { target: { value: 'Achrome' } });
    expect(within(dialog).getByText('⟦findReplace.willUpdate⟧')).toBeInTheDocument();
    expectAllMarked();
    fireEvent.click(within(dialog).getAllByRole('combobox')[0]);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expectAllMarked();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    fireEvent.click(within(dialog).getByRole('button', { name: '⟦findReplace.replaceAll⟧' }));
    expect(within(dialog).getByText('⟦findReplace.replaced⟧')).toBeInTheDocument();
    expectAllMarked();
    fireEvent.click(within(dialog).getAllByRole('button', { name: '⟦findReplace.close⟧' })[0]);

    // Export menu
    fireEvent.keyDown(screen.getByRole('button', { name: '⟦export.menu⟧' }), { key: 'Enter' });
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expectAllMarked();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    // AI Edit: examples, proposed edits, no changes, failures with and without the Host App's message
    fireEvent.click(screen.getByRole('button', { name: '⟦aiEdit.open⟧' }));
    expect(screen.getByText('⟦aiEdit.examples⟧')).toBeInTheDocument();
    expectAllMarked();
    const prompt = screen.getByPlaceholderText('⟦aiEdit.placeholder⟧');
    for (const expected of ['⟦aiEdit.willEdit⟧', '⟦aiEdit.noChanges⟧', '⟦aiEdit.failed⟧', 'Servizio non disponibile']) {
      fireEvent.change(prompt, { target: { value: 'Maiuscole' } });
      await act(async () => {
        fireEvent.keyDown(prompt, { key: 'Enter' });
      });
      expect(await screen.findByText(expected)).toBeInTheDocument();
      expectAllMarked();
      fireEvent.click(screen.getAllByRole('button', { name: /⟦aiEdit\.(dismiss|cancel)⟧/ })[0]);
    }
  });

  it('while committing, and in the Import Report with the Host App’s reasons as written', async () => {
    // One row per batch: Achrome is saved, Concetto spaziale is refused by the
    // Host App (its reason is its own text), Nature morte's batch can't be
    // sent on any of its 3 attempts (calls 3 to 5)
    const host = createFakeHostApp<Rec>({
      reject: (row) => (row.record.title === 'Concetto spaziale' ? { reason: 'Opera già presente', field: 'title' } : null),
    });
    const second = host.hold(2);
    const retry = host.hold(4);
    for (const call of [3, 4, 5]) host.onCall(call, { fail: new Error('Servizio non disponibile') });
    await reviewMarked({ host, batchSize: 1 });
    // Row 2 has errors: leave it out, so the report has an Excluded Row too
    fireEvent.click(screen.getByRole('button', { name: '⟦review.excludeErrors⟧' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '⟦review.complete⟧' }));
      await second.reached;
    });
    expect(screen.getByRole('status')).toHaveTextContent('⟦commit.progress⟧');
    expect(screen.getByText('⟦steps.import⟧')).toBeInTheDocument();
    expectAllMarked();

    // Retrying the batch that failed in transit
    await act(async () => {
      second.release();
      await retry.reached;
    });
    expect(screen.getByRole('status')).toHaveTextContent('⟦commit.retrying⟧');
    expectAllMarked();

    await act(async () => retry.release());
    await screen.findByText('⟦report.title⟧');
    expect(screen.getByText('⟦report.created⟧')).toBeInTheDocument();
    expect(screen.getByText('Opera già presente')).toBeInTheDocument();
    expect(screen.getByText('⟦commit.notSent⟧')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '⟦report.excludedTitle⟧' })).toBeInTheDocument();
    expect(screen.getByText('⟦report.downloadHint⟧')).toBeInTheDocument();
    expectAllMarked();

    // The downloaded Rejected Rows: file name, sheet name, error column header and text
    const downloads: { fileName: string; blob: Blob }[] = [];
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ fileName: this.download, blob: vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob });
    });
    fireEvent.click(screen.getByRole('button', { name: '⟦report.download⟧' }));
    expect(downloads.map((d) => d.fileName)).toEqual(['⟦report.downloadFileName⟧.xlsx']);
    const { sheetName, rows } = await readSheet(downloads[0].blob);
    expect(sheetName).toBe('⟦report.downloadSheetName⟧');
    expect(rows.map((row) => row.at(-1))).toEqual([
      '⟦report.downloadErrorHeader⟧',
      '⟦report.downloadFieldError⟧',
      '⟦report.downloadError⟧',
    ]);
  });
});
