/**
 * The features page: every piece is the live component, every review note
 * still finds the part it talks about, and the theming specimen switches
 * language and theme.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Features from '../../Features';
import { PIECES } from '../pieces';
import { SPOTLIGHT_ATTRIBUTE } from '../spotlight';

/** Render the page, and wait for the specimens that load from the simulated archive: the review's currencies, Resolution's lookup */
async function renderPage() {
  const result = render(
    <MemoryRouter initialEntries={['/features']}>
      <Features />
    </MemoryRouter>
  );
  // The review holds the whole sample, row 11 (no title) flagged
  const review = document.getElementById('piece-review')!;
  await within(review).findByText('12 rows', undefined, { timeout: 5000 });
  expect(within(review).getByText('Blocked 1')).toBeInTheDocument();
  await screen.findByText(/^Several matches/, undefined, { timeout: 5000 });
  return result;
}

describe('the features page', () => {
  it('shows every piece live, and each note outlines the part it is about', async () => {
    await renderPage();

    for (const piece of PIECES) {
      const box = document.getElementById(piece.id)!;
      const stage = box.querySelector('[data-specimen]')!;
      const lit = () => Array.from(box.querySelectorAll(`[${SPOTLIGHT_ATTRIBUTE}]`));
      const notes = Array.from(box.querySelectorAll<HTMLButtonElement>('[data-note]'));
      expect(notes).toHaveLength(piece.notes.length);

      // The first note starts open, its part outlined
      expect(lit().map((el) => el.getAttribute(SPOTLIGHT_ATTRIBUTE))).toEqual(['1']);

      notes.forEach((note, i) => {
        fireEvent.focus(note);
        expect(lit(), `${piece.id}: "${piece.notes[i].title}" finds its part`).toHaveLength(1);
        expect(lit()[0].getAttribute(SPOTLIGHT_ATTRIBUTE)).toBe(String(i + 1));
        // The outlined part is inside the live specimen, not the page around it
        expect(stage.contains(lit()[0])).toBe(true);
        fireEvent.blur(note);
      });
    }
  });

  it('keeps the note the reader opened outlined, and shows its text', async () => {
    await renderPage();
    const row = document.getElementById('piece-commit')!;
    const [first, second] = Array.from(row.querySelectorAll<HTMLButtonElement>('[data-note]'));
    expect(first).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(second);
    fireEvent.blur(second);
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(within(row).getByRole('status', { hidden: false }).closest(`[${SPOTLIGHT_ATTRIBUTE}]`)).toHaveAttribute(
      SPOTLIGHT_ATTRIBUTE,
      '2'
    );
    // Only the open note's text is exposed
    expect(document.getElementById(second.getAttribute('aria-controls')!)).not.toHaveAttribute('aria-hidden');
    expect(document.getElementById(first.getAttribute('aria-controls')!)).toHaveAttribute('aria-hidden', 'true');
  });

  it('captions the hero wizard with the part its pill names', async () => {
    await renderPage();
    const hero = document.getElementById('piece-wizard')!;
    const pill = within(hero).getByRole('button', { name: 'Expected columns' });

    fireEvent.click(pill);
    expect(pill).toHaveAttribute('aria-pressed', 'true');
    expect(within(hero).getByText(/A faded preview of the Output Shape's fields/)).toBeInTheDocument();
    expect(hero.querySelector('table')).toHaveAttribute(SPOTLIGHT_ATTRIBUTE, '3');
  });

  it("shows what a specimen's component tells its Host App", async () => {
    await renderPage();
    const box = document.getElementById('piece-mapping')!;
    expect(within(box).getByText(/What the component tells its Host App/)).toBeInTheDocument();

    fireEvent.click(within(box).getByRole('button', { name: /Continue to Validation/ }));
    expect(within(box).getByText('onConfirm()')).toBeInTheDocument();
  });

  it('reports the same outcome the lifecycle describes', async () => {
    await renderPage();
    const report = document.getElementById('piece-report')!;
    expect(within(report).getByText('9 imported')).toBeInTheDocument();
    expect(within(report).getByText('2 rejected')).toBeInTheDocument();
    expect(within(report).getByText('1 excluded')).toBeInTheDocument();
    expect(screen.getByText(/9 imported, 2 rejected with a reason, 1 excluded/)).toBeInTheDocument();
  });

  it('switches the theming specimen between languages and Host App themes', async () => {
    await renderPage();
    const specimen = screen.getByTestId('themed-specimen');

    // Italian by default: headings and plurals from the Host App's catalogue, the Host App's own reasons untouched
    expect(within(specimen).getByText('Importazione completata')).toBeInTheDocument();
    expect(within(specimen).getByText('9 importate')).toBeInTheDocument();
    expect(within(specimen).getByRole('button', { name: /Correggi e riprova \(2 righe\)/ })).toBeInTheDocument();
    expect(within(specimen).getByText(/The archive does not accept "Senza titolo"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    expect(within(specimen).getByText('Import finished')).toBeInTheDocument();
    expect(within(specimen).getByText('9 imported')).toBeInTheDocument();

    expect(specimen).toHaveClass('wv-theme-primer');
    fireEvent.click(screen.getByRole('radio', { name: 'Archivio' }));
    expect(specimen).toHaveClass('wv-theme-archivio');
    expect(screen.getByRole('radio', { name: 'Archivio' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the specimens in the wizard\'s dark theme, and the theming specimen in either', async () => {
    await renderPage();
    for (const stage of document.querySelectorAll('[data-specimen]')) {
      expect(stage).toHaveClass('dark');
      expect(stage.querySelector('.dw-root')).not.toBeNull();
    }

    const specimen = screen.getByTestId('themed-specimen');
    expect(specimen).not.toHaveClass('dark');
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(specimen).toHaveClass('dark');
  });
});
