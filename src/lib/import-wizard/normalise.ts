/**
 * The Normalised Match rule: two values are the same when they are equal once
 * case, extra spaces and accents are ignored. Shared by choice fields and
 * Resolution, and it is the rule a Host App's lookup must apply too.
 *
 * Normalising is only for comparing: stored values keep their spelling.
 */

/**
 * Normalise a value for comparing, in this order:
 * 1. Unicode canonical decomposition (NFD), so `ò` becomes `o` + a combining accent;
 * 2. strip combining marks (the accents);
 * 3. lowercase;
 * 4. collapse every run of whitespace (any Unicode space, including
 *    non-breaking spaces, tabs and newlines) to a single space;
 * 5. trim.
 *
 * Punctuation and word order are kept: `Fontana, Lucio` is not a Normalised
 * Match of `Lucio Fontana`.
 *
 * A Python Host App gets the same result with:
 * `" ".join("".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.category(c).startswith("M")).lower().split())`
 *
 * @example normaliseForMatch(' Niccolò\u00a0 MACHIAVELLI ') // 'niccolo machiavelli'
 */
export function normaliseForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether two non-empty values are a Normalised Match of each other */
export function isNormalisedMatch(a: string, b: string): boolean {
  const normalised = normaliseForMatch(a);
  return normalised !== '' && normalised === normaliseForMatch(b);
}
