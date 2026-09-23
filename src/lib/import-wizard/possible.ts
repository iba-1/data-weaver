/**
 * Possible Matches within the file: distinct values of one kind that might be
 * the same Related Record although they are not a Normalised Match, e.g.
 * `Fontana, Lucio` or `L. Fontana` and `Lucio Fontana`. They are only
 * suggestions: nothing is merged unless the Importer confirms (ADR-0001).
 *
 * The rules are deliberately conservative, because merging two different
 * people is far worse than missing a suggestion. Two values are paired when,
 * compared as words (after the Normalised Match rule, so case, spacing and
 * accents are already ignored), they have the same number of words and:
 * - the same words in another order or with other punctuation
 *   (`Fontana, Lucio` / `Lucio Fontana`, `Jean-Paul` / `Jean Paul`); or
 * - the same words except that some are initials of the other's words
 *   (`L. Fontana` / `Lucio Fontana`, `Fontana, L.` / `Lucio Fontana`), with at
 *   least one whole word in common. So `A. Rossi` pairs with `Anna Rossi` and
 *   with `Andrea Rossi`, but `Anna Rossi` never pairs with `Mario Rossi`, nor
 *   `Fontana` with `Lucio Fontana`.
 */

import { normaliseForMatch } from './normalise';

/** Apostrophes are part of a word (`D'Annunzio`), whichever the file uses */
const APOSTROPHES = /['‘’ʼ`´]/g;

/**
 * A value's words for comparing: normalised (`normaliseForMatch`), apostrophes
 * dropped, then split on anything that is not a letter or a digit.
 *
 * @example matchWords('Fontana, L.') // ['fontana', 'l']
 */
export function matchWords(value: string): string[] {
  return normaliseForMatch(value)
    .replace(APOSTROPHES, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

const isInitial = (word: string) => [...word].length === 1 && /\p{L}/u.test(word);
/** A word that anchors a pairing by initials: a whole word, not an initial or a number */
const isWholeWord = (word: string) => [...word].length >= 2 && /\p{L}/u.test(word);
const initialOf = (initial: string, word: string) => isInitial(initial) && isWholeWord(word) && word.startsWith(initial);

// Pairing by initials tries every assignment: more words than this are not compared
const MAX_INITIALS = 6;

/** Whether each of `a` can be paired with a different one of `b`, as an initial of it or it of an initial */
function pairAsInitials(a: string[], b: string[]): boolean {
  if (a.length === 0) return true;
  const [first, ...rest] = a;
  return b.some(
    (word, i) => (initialOf(first, word) || initialOf(word, first)) && pairAsInitials(rest, [...b.slice(0, i), ...b.slice(i + 1)])
  );
}

/** The rules above, on two values' words */
function wordsMightMatch(a: string[], b: string[]): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  const unmatched = [...b];
  const onlyInA: string[] = [];
  let anchored = false;
  for (const word of a) {
    const i = unmatched.indexOf(word);
    if (i === -1) {
      onlyInA.push(word);
    } else {
      unmatched.splice(i, 1);
      anchored ||= isWholeWord(word);
    }
  }
  // The same words, in another order or with other punctuation
  if (onlyInA.length === 0) return true;
  return anchored && onlyInA.length <= MAX_INITIALS && pairAsInitials(onlyInA, unmatched);
}

/**
 * Whether two values might be the same Related Record without being a
 * Normalised Match of each other (see the rules above).
 */
export function isPossibleMatch(a: string, b: string): boolean {
  const normalisedA = normaliseForMatch(a);
  const normalisedB = normaliseForMatch(b);
  if (normalisedA === '' || normalisedB === '' || normalisedA === normalisedB) return false;
  return wordsMightMatch(matchWords(a), matchWords(b));
}

/** Two values of one kind that might be the same Related Record, in file order */
export interface PossiblePair {
  kind: string;
  values: [string, string];
}

/**
 * The Possible Matches among the distinct values of a file (e.g. from
 * `collectRelatedValues`): every pair of values of the same kind that
 * `isPossibleMatch`, ordered by where each value is in `values`.
 *
 * Only values that could pair are compared, so a file with thousands of
 * distinct values stays fast: values with the same words, and values with an
 * initial against those whose words start with the same letters.
 */
export function findPossibleMatches(values: ReadonlyArray<{ kind: string; value: string }>): PossiblePair[] {
  const words = values.map((v) => matchWords(v.value));
  const byWords = new Map<string, number[]>();
  const byLetters = new Map<string, number[]>();
  values.forEach((v, i) => {
    if (words[i].length === 0) return;
    const add = (map: Map<string, number[]>, key: string) => map.set(key, [...(map.get(key) ?? []), i]);
    add(byWords, `${v.kind}\u0000${[...words[i]].sort().join(' ')}`);
    add(byLetters, `${v.kind}\u0000${words[i].map((w) => [...w][0]).sort().join('')}`);
  });

  const found = new Map<string, [number, number]>();
  const consider = (i: number, j: number) => {
    const [first, second] = i < j ? [i, j] : [j, i];
    const id = `${first},${second}`;
    if (first === second || found.has(id)) return;
    if (isPossibleMatch(values[first].value, values[second].value)) found.set(id, [first, second]);
  };
  // The same words, in any order
  for (const group of byWords.values()) {
    for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) consider(group[a], group[b]);
  }
  // Initials: each pair of words shares its first letter, and one of the two values has an initial
  for (const group of byLetters.values()) {
    for (const i of group) {
      if (!words[i].some(isInitial)) continue;
      for (const j of group) consider(i, j);
    }
  }

  return [...found.values()]
    .sort(([a1, b1], [a2, b2]) => a1 - a2 || b1 - b2)
    .map(([i, j]) => ({ kind: values[i].kind, values: [values[i].value, values[j].value] }));
}
