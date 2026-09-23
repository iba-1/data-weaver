/**
 * Choice fields: fields whose value must be one of a list of options, given
 * by the Host App as a list or loaded once when the review step starts.
 */

import type { ChoiceOption, FieldConfig } from './types';
import { normaliseForMatch } from './normalise';

/** How many options a cell error lists before summarising the rest */
const OPTIONS_IN_MESSAGE = 5;

const AMBIGUOUS = Symbol('ambiguous');

interface ChoiceIndex {
  exact: Set<string>;
  byValue: Map<string, string | typeof AMBIGUOUS>;
  byLabel: Map<string, string | typeof AMBIGUOUS>;
}

// Built once per options list, so reading 10k cells doesn't re-normalise every option
const indexes = new WeakMap<ChoiceOption[], ChoiceIndex>();

function addTo(map: ChoiceIndex['byValue'], key: string, value: string) {
  if (key === '') return;
  const existing = map.get(key);
  map.set(key, existing === undefined || existing === value ? value : AMBIGUOUS);
}

function indexOf(options: ChoiceOption[]): ChoiceIndex {
  let index = indexes.get(options);
  if (!index) {
    index = { exact: new Set(), byValue: new Map(), byLabel: new Map() };
    for (const option of options) {
      index.exact.add(option.value);
      addTo(index.byValue, normaliseForMatch(option.value), option.value);
      if (option.label !== undefined) addTo(index.byLabel, normaliseForMatch(option.label), option.value);
    }
    indexes.set(options, index);
  }
  return index;
}

/**
 * The canonical value of the option `value` is a Normalised Match of, or null.
 * An exact option value wins, then a Normalised Match of an option's value,
 * then of an option's label. A value that matches several options at the same
 * level is not guessed: it returns null.
 */
export function matchChoice(value: unknown, options: ChoiceOption[]): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  const index = indexOf(options);
  if (index.exact.has(text)) return text;

  const key = normaliseForMatch(text);
  const match = index.byValue.get(key) ?? index.byLabel.get(key);
  return typeof match === 'string' ? match : null;
}

/** A choice field's options when they are a list; undefined while they are still a loader */
export function choiceOptions(field: Pick<FieldConfig, 'options'>): ChoiceOption[] | undefined {
  return Array.isArray(field.options) ? field.options : undefined;
}

/** What the Importer sees for an option */
export function choiceLabel(option: ChoiceOption): string {
  return option.label ?? option.value;
}

/**
 * Read a cell or an edit of a choice field: blank is null, a Normalised Match
 * of an option is its canonical value, and anything else keeps its text for
 * validation to flag.
 */
export function coerceChoice(value: unknown, field: Pick<FieldConfig, 'options'>): unknown {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const options = choiceOptions(field);
  return (options && matchChoice(text, options)) ?? text;
}

/** The cell error for a non-empty choice value, or null when it is one of the options */
export function checkChoice(
  value: unknown,
  field: Pick<FieldConfig, 'label' | 'options'>
): string | null {
  const options = choiceOptions(field);
  if (!options) return `The options for ${field.label} are not loaded`;
  if (options.length === 0) return `${field.label} has no options to choose from`;
  if (typeof value === 'string' && indexOf(options).exact.has(value)) return null;

  const listed = options.slice(0, OPTIONS_IN_MESSAGE).map(choiceLabel).join(', ');
  const more = options.length - OPTIONS_IN_MESSAGE;
  return `${field.label} must be one of: ${listed}${more > 0 ? ` and ${more} more` : ''}`;
}

/** Whether any choice field still has a loader instead of a list of options */
export function hasOptionLoaders(fields: Pick<FieldConfig, 'type' | 'options'>[]): boolean {
  return fields.some((f) => f.type === 'choice' && typeof f.options === 'function');
}

function isOptionList(options: unknown): options is ChoiceOption[] {
  return (
    Array.isArray(options) &&
    options.every(
      (o) =>
        typeof o === 'object' &&
        o !== null &&
        typeof o.value === 'string' &&
        (o.label === undefined || typeof o.label === 'string')
    )
  );
}

/**
 * Call every choice field's options loader, once each and in parallel, and
 * return the fields with their loaded options. Fields without a loader are
 * returned as they are.
 *
 * Rejects with an Error naming the field when a loader rejects or returns
 * something that is not a list of `{ value, label }` options.
 */
export async function loadChoiceOptions<TKey extends string>(
  fields: FieldConfig<TKey>[]
): Promise<FieldConfig<TKey>[]> {
  return Promise.all(
    fields.map(async (field) => {
      if (field.type !== 'choice' || typeof field.options !== 'function') return field;

      let options: unknown;
      try {
        options = await field.options();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not load the options for ${field.label}: ${reason}`);
      }
      if (!isOptionList(options)) {
        throw new Error(
          `Could not load the options for ${field.label}: expected a list of { value, label } options`
        );
      }
      return { ...field, options };
    })
  );
}
