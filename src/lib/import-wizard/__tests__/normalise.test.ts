import { describe, it, expect } from 'vitest';
import { isNormalisedMatch, normaliseForMatch } from '../normalise';

describe('normaliseForMatch', () => {
  it('ignores case', () => {
    expect(normaliseForMatch('EUR')).toBe('eur');
    expect(normaliseForMatch('Lucio FONTANA')).toBe('lucio fontana');
  });

  it('strips accents, including Italian names', () => {
    expect(normaliseForMatch('Niccolò')).toBe('niccolo');
    expect(normaliseForMatch('Niccolò Machiavelli')).toBe('niccolo machiavelli');
    expect(normaliseForMatch('Nicolò Cusàno')).toBe('nicolo cusano');
    expect(normaliseForMatch('Città di Castello')).toBe('citta di castello');
    expect(normaliseForMatch('perché così è')).toBe('perche cosi e');
    expect(normaliseForMatch('Éluard, Ñandú, Škoda, Øre')).toBe('eluard, nandu, skoda, øre');
  });

  it('treats a precomposed and a decomposed accent the same', () => {
    const precomposed = 'Niccol\u00f2'; // ò as one code point
    const decomposed = 'Niccolo\u0300'; // o + combining grave accent
    expect(normaliseForMatch(precomposed)).toBe(normaliseForMatch(decomposed));
  });

  it('strips the dot of a capital dotted I', () => {
    expect(normaliseForMatch('İstanbul')).toBe('istanbul');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normaliseForMatch('  niccolo ')).toBe('niccolo');
    expect(normaliseForMatch('\tEUR\n')).toBe('eur');
  });

  it('collapses runs of inner whitespace to one space', () => {
    expect(normaliseForMatch('Lucio   Fontana')).toBe('lucio fontana');
    expect(normaliseForMatch('Lucio \t\n Fontana')).toBe('lucio fontana');
  });

  it('treats non-breaking and other Unicode spaces as whitespace', () => {
    expect(normaliseForMatch('Lucio\u00a0Fontana')).toBe('lucio fontana');
    expect(normaliseForMatch('\u00a0EUR\u00a0')).toBe('eur');
    expect(normaliseForMatch('Lucio\u202fFontana')).toBe('lucio fontana'); // narrow no-break space
    expect(normaliseForMatch('Lucio\u2003\u00a0 Fontana')).toBe('lucio fontana'); // em space + nbsp + space
  });

  it('keeps punctuation and word order: those are not Normalised Matches', () => {
    expect(normaliseForMatch('Fontana, Lucio')).toBe('fontana, lucio');
    expect(normaliseForMatch('L. Fontana')).toBe('l. fontana');
  });

  it('leaves an empty or blank value empty', () => {
    expect(normaliseForMatch('')).toBe('');
    expect(normaliseForMatch(' \u00a0 ')).toBe('');
  });
});

describe('isNormalisedMatch', () => {
  it('matches values that differ only by case, spacing and accents', () => {
    expect(isNormalisedMatch('Niccolò', 'niccolo ')).toBe(true);
    expect(isNormalisedMatch('lucio fontana', 'Lucio  Fontana')).toBe(true);
    expect(isNormalisedMatch('eur', 'EUR')).toBe(true);
  });

  it('does not match different word order, punctuation or initials', () => {
    expect(isNormalisedMatch('Fontana, Lucio', 'Lucio Fontana')).toBe(false);
    expect(isNormalisedMatch('L. Fontana', 'Lucio Fontana')).toBe(false);
    expect(isNormalisedMatch('LucioFontana', 'Lucio Fontana')).toBe(false);
  });

  it('does not match an empty value to a blank one as a name', () => {
    expect(isNormalisedMatch('', 'EUR')).toBe(false);
  });
});
