/**
 * The demo page: the Host App's own controls around the wizard, and the
 * sample file taking the wizard as far as Resolution against the simulated
 * archive, with no AI Edit anywhere.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import Index from '../../Index';
import { SAMPLE_FILE_NAME, sampleSpreadsheet } from '../outputShape';
import { blobBytes } from '@/test/spreadsheet';
import { continueToResolution } from '@/test/wizardDriver';

vi.mock('@/lib/import-wizard/parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/import-wizard/parser')>();
  return { ...actual, parseFile: vi.fn() };
});

import { parseFile } from '@/lib/import-wizard/parser';

/** The wizard reads the real sample file (jsdom's File can't hand the parser its bytes, so they're passed directly) */
async function mockSampleFile() {
  const actual = await vi.importActual<typeof import('@/lib/import-wizard/parser')>('@/lib/import-wizard/parser');
  const bytes = await blobBytes(sampleSpreadsheet());
  const parsed = await actual.parseFile({ name: SAMPLE_FILE_NAME, arrayBuffer: async () => bytes.buffer } as unknown as File);
  vi.mocked(parseFile).mockResolvedValue(parsed);
}

beforeEach(() => {
  vi.mocked(parseFile).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the demo page', () => {
  it('shows the Host App console, the sample and the wizard, and walks the sample to Resolution without AI Edit', async () => {
    await mockSampleFile();
    render(<Index />);

    // The Host App's own controls, outside the wizard
    const refuse = screen.getByRole('switch', { name: 'Refuse a title' });
    expect(refuse).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(refuse);
    expect(refuse).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('textbox', { name: 'Title to refuse' })).toHaveValue('Senza titolo');
    expect(screen.getByRole('switch', { name: "Lose the next batch's answer" })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: '3 rows per batch' })).toBeChecked();
    expect(screen.getByRole('button', { name: /download the sample/i })).toBeInTheDocument();

    // The archive's registry, with its Homonyms
    const registry = screen.getByText('Registry (6)').closest('details')!;
    expect(within(registry).getAllByText('Mario Rossi')).toHaveLength(2);
    expect(screen.getByText('No artwork saved twice.')).toBeInTheDocument();

    // Upload the sample and review it: the currencies come from the archive
    await act(async () => {
      fireEvent.change(document.getElementById('file-input')!, { target: { files: [new File(['x'], SAMPLE_FILE_NAME)] } });
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /continue to validation/i }));
    });
    await screen.findByRole('button', { name: 'Exclude row 11' }, { timeout: 5000 });
    expect(screen.queryByRole('button', { name: /ai edit/i })).not.toBeInTheDocument();

    // Row 11 has no title; left out, Resolution opens against the archive's registry
    fireEvent.click(screen.getByRole('button', { name: 'Exclude row 11' }));
    await continueToResolution(/link related records/i, /complete import/i);

    const section = screen.getByRole('region', { name: 'Artist, Owner' });
    expect(within(section).getByRole('region', { name: /several matches/i })).toHaveTextContent('Mario Rossi');
    expect(within(section).getByRole('region', { name: /possibly the same/i })).toHaveTextContent('L. Fontana');
    expect(screen.getByText(/findRelated\(registry\) · 8 names/)).toBeInTheDocument();
  });
});
