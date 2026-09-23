/**
 * The message catalogue: every piece of text the Importer sees, in English.
 *
 * A Host App translates the wizard by passing a partial catalogue; anything it
 * leaves out falls back to these English defaults. An entry is either a string
 * with named placeholders (`'{count} rows'`) or a function of its parameters,
 * so a Host App can apply plural rules with its own i18n library.
 *
 * Keys are grouped by where the text appears and are part of the public API.
 */

import type { DateOrder } from './dates';

/** A message's text: a string with `{name}` placeholders, or a function of its parameters */
export type MessageEntry<P = void> = string | MessageFormatter<P>;

/** A message as a function; messages without parameters take none */
export type MessageFormatter<P = void> = [P] extends [void] ? () => string : (params: P) => string;

/** The parameters each message receives, by group and key. `void` means none. */
export interface MessageParams {
  /** The step indicator */
  steps: {
    upload: void;
    mapping: void;
    review: void;
    /** Shown only when the Output Shape has Relationship Fields */
    resolution: void;
    import: void;
  };
  /** The upload step */
  upload: {
    helpText: void;
    dropHere: void;
    dragAndDrop: void;
    /** `types` is e.g. `.csv, .xlsx`; `maxSize` e.g. `10 MB` */
    accepted: { types: string; maxSize: string; maxBytes: number };
    chooseFile: void;
    unsupportedType: { fileName: string; types: string };
    tooLarge: { fileName: string; maxSize: string; maxBytes: number };
    empty: { fileName: string };
    /** `reason` is the parser's own (English) error */
    unreadable: { fileName: string; reason: string };
  };
  /** The column matching step */
  mapping: {
    title: void;
    description: void;
    mappedCount: { mapped: number; total: number };
    autoMatched: void;
    autoBadge: void;
    selectField: void;
    doNotImport: void;
    /** `fields` is the missing fields' labels, comma-separated */
    missingRequired: { fields: string; count: number };
    continue: void;
  };
  /** Loading choice fields' options before the review opens */
  options: {
    /** `fields` is the labels of the fields being loaded, comma-separated */
    loading: { fields: string; count: number };
    /** `reason` is the message of the Error the Host App's loader rejected with */
    loadFailed: { field: string; reason: string };
    blocked: void;
    retry: void;
  };
  /** The review step */
  review: {
    title: void;
    description: void;
    rowCount: { count: number };
    rowCountFiltered: { visible: number; total: number };
    filterValid: { count: number };
    filterWarnings: { count: number };
    filterErrors: { count: number };
    filterExcluded: { count: number };
    noSearchMatches: void;
    noFilterMatches: void;
    rowNumberHeader: void;
    statusHeader: void;
    /** `row` is the row's number as the Importer sees it, starting at 1 */
    excludeRow: { row: number };
    includeRow: { row: number };
    excludeRowHint: void;
    includeRowHint: void;
    excludedStatus: void;
    cellLabel: { field: string; row: number };
    excludeErrors: void;
    excludeErrorsHint: void;
    fillRequired: void;
    fillRequiredHint: void;
    /** Written into empty required cells by "Fill Required" when the field has no `placeholder` */
    fillPlaceholder: void;
    undo: void;
    redo: void;
    back: void;
    excludedCount: { count: number };
    complete: { count: number };
    /** The review's main button when the Output Shape has Relationship Fields: on to Resolution */
    continueToResolution: { count: number };
  };
  /** Saving the rows through the Host App (Commit) */
  commit: {
    title: void;
    /** `done` counts rows with an outcome, saved or rejected */
    progress: { done: number; total: number };
    progressLabel: void;
    keepOpen: void;
    /**
     * Shown while a batch that failed in transit is being sent again.
     * `attempt` is the attempt being made (from 2) of `attempts` in total.
     */
    retrying: { attempt: number; attempts: number };
    /**
     * A Rejected Row's reason when its batch could not be sent: the server
     * could not be reached on any of the `attempts` made (1 when retrying is off)
     */
    notSent: { attempts: number };
    /** A Rejected Row's reason when the Host App's answer had no valid outcome for it */
    invalidAnswer: void;
    /** A Rejected Row's reason when the Host App rejected it without one */
    noReason: void;
  };
  /**
   * Resolution: linking each distinct Relationship Field value to an existing
   * Related Record or a new one, before Commit. `fields` is the labels of the
   * fields of one kind, comma-separated.
   */
  resolution: {
    title: void;
    description: void;
    loading: { fields: string; count: number };
    /** `reason` is the message of the Error the Host App's `findRelated` rejected with, or `invalidLookup` */
    lookupFailed: { fields: string; reason: string };
    /** The reason when the Host App's lookup answer could not be read */
    invalidLookup: void;
    blocked: void;
    retry: void;
    /** Heading of one kind's values */
    kindTitle: { fields: string; count: number };
    empty: void;
    matchedTitle: { count: number };
    matchedDescription: void;
    createTitle: { count: number };
    createDescription: void;
    undecidedTitle: { count: number };
    undecidedDescription: void;
    /** Introduces the existing records that share a value's name (Homonyms) */
    homonyms: { count: number };
    /** The group of values matching several existing records (Homonyms) */
    homonymsTitle: { count: number };
    homonymsDescription: void;
    /** Accessible name of a Homonym's choices; `value` is the value as spelled in the file */
    homonymChoice: { value: string };
    /** The choice to create a new record with a Homonym's name, for the value or one row */
    createNew: void;
    /** The button showing a Homonym's rows, to choose for each; `count` is its rows */
    perRow: { count: number };
    /** How many of a Homonym's rows have their own choice */
    perRowCount: { count: number };
    /** A row in the per-row choices: its number as in the grid, and its first field's text (may be empty) */
    rowLabel: { row: number; title: string };
    /** Accessible name of one row's choice */
    rowChoice: { row: number; value: string };
    /** The row choice that follows the value's choice */
    rowDefault: void;
    /** Introduces what a value might be the same as: other values of the file, or existing records (Possible Matches) */
    possible: { count: number };
    /** The values that might be the same as another value of the file or an existing record */
    possibleTitle: { count: number };
    possibleDescription: void;
    /** Merging a value with another value of the file; `name` is that value as spelled in the file */
    mergeWithValue: { name: string };
    /** Merging a value with an existing record; `description` is the Host App's (may be empty) */
    mergeWithRecord: { name: string; description: string };
    /** Not merging a value with any of its Possible Matches (the default) */
    keepSeparate: void;
    /** An existing record; `description` is the Host App's (may be empty) */
    candidate: { name: string; description: string };
    /** How many rows use a value */
    rowCount: { count: number };
    /** The spellings folded into a value; `spellings` is `spelling` entries, comma-separated */
    spellings: { spellings: string; count: number };
    spelling: { text: string; count: number };
    /** Accessible label of the input for a new record's name; `value` is the value as spelled in the file */
    nameLabel: { value: string };
    nameRequired: void;
    back: void;
    complete: { count: number };
    blockedUndecided: { count: number };
    blockedUnnamed: { count: number };
    /**
     * Badges on grid cells after Resolution: the record a value is linked to,
     * or will create. `description` tells a chosen Homonym apart (may be empty).
     */
    badgeLinked: { name: string; description: string };
    badgeNew: { name: string };
    badgeUndecided: void;
    /** A Rejected Row's reason when a Related Record it points to could not be created */
    notCreated: { name: string; reason: string };
    /** The reason when the Host App's `createRelated` resolved without an ID */
    invalidId: void;
  };
  /** The Import Report after Commit */
  report: {
    title: void;
    created: { count: number };
    rejected: { count: number };
    excluded: { count: number };
    rejectedTitle: void;
    rejectedDescription: void;
    excludedTitle: void;
    excludedDescription: void;
    rowHeader: void;
    fieldHeader: void;
    reasonHeader: void;
    /** The button that downloads the Rejected Rows as a spreadsheet */
    download: void;
    /** Next to the download button: the report is not kept, so unfixed Rejected Rows are lost on leaving */
    downloadHint: void;
    /** The downloaded file's name without extension; `fileName` is the uploaded file's, without extension */
    downloadFileName: { fileName: string };
    /** The downloaded workbook's sheet (Excel keeps at most 31 characters and drops `: \ / ? * [ ]`) */
    downloadSheetName: void;
    /** The header of the downloaded file's error column */
    downloadErrorHeader: void;
    /** A Rejected Row's error in the downloaded file, when the Host App gave no field */
    downloadError: { reason: string };
    /** A Rejected Row's error in the downloaded file; `field` is the field's label */
    downloadFieldError: { reason: string; field: string };
  };
  /** A cell of the review grid */
  cell: {
    empty: void;
    clear: void;
    save: void;
    cancel: void;
  };
  /** The review step's search box */
  search: {
    placeholder: void;
    clear: void;
    matchCount: { count: number };
  };
  /** The Find and Replace dialog */
  findReplace: {
    open: void;
    title: void;
    description: void;
    find: void;
    findPlaceholder: void;
    replace: void;
    replacePlaceholder: void;
    column: void;
    allColumns: void;
    caseSensitive: void;
    wholeWord: void;
    willUpdate: { count: number };
    noMatches: void;
    replaced: { count: number };
    close: void;
    replaceAll: void;
  };
  /** The export menu and the files it downloads */
  export: {
    menu: void;
    csv: void;
    excel: void;
    validOnly: void;
    /** File name without extension */
    fileName: void;
    /** File name without extension, for valid rows only */
    validFileName: void;
    sheetName: void;
  };
  /** AI Edit */
  aiEdit: {
    open: void;
    placeholder: void;
    send: void;
    examplesLabel: void;
    /** Example instructions, one per line; empty for none */
    examples: void;
    working: void;
    /** Shown when the Host App's handler fails without an Error message */
    failed: void;
    noChanges: { command: string };
    command: { command: string };
    willEdit: { count: number };
    previewRow: { row: number; changes: string };
    previewChange: { field: string; value: string };
    more: { count: number };
    cancel: void;
    apply: void;
    dismiss: void;
  };
  /**
   * Validation messages Data Weaver raises itself. `field` is the field's
   * label. Messages from the Host App's own validators are shown as they are.
   */
  validation: {
    required: { field: string };
    /** `format` is `DD/MM/YYYY` or `MM/DD/YYYY`, following the field's `dateOrder` */
    invalidDate: { field: string; format: string; dateOrder: DateOrder };
    /** `options` is the first options' labels, comma-separated */
    notAnOption: { field: string; options: string };
    notAnOptionAndMore: { field: string; options: string; more: number };
    optionsNotLoaded: { field: string };
    noOptions: { field: string };
    /** The legacy artwork fields' warnings, used only when no `fields` are given */
    amountWithoutCurrency: { field: string };
    currencyWithoutAmount: { field: string };
    numericOnly: { field: string };
  };
}

export type MessageGroup = keyof MessageParams;

/** A complete catalogue, like the English defaults */
export type MessageCatalogue = {
  [G in MessageGroup]: { [K in keyof MessageParams[G]]: MessageEntry<MessageParams[G][K]> };
};

/** What a Host App passes: any groups, and any entries within them */
export type PartialMessageCatalogue = {
  [G in MessageGroup]?: Partial<MessageCatalogue[G]>;
};

/** A catalogue with every entry as a function, ready to call */
export type ResolvedMessages = {
  [G in MessageGroup]: { [K in keyof MessageParams[G]]: MessageFormatter<MessageParams[G][K]> };
};

/** A validation message Data Weaver raised: its catalogue key and parameters */
export type ValidationMessageRef = {
  [K in keyof MessageParams['validation']]: { key: K; params: MessageParams['validation'][K] };
}[keyof MessageParams['validation']];

const count = (n: number) => n.toLocaleString();
const plural = (n: number, one: string, other: string) => `${count(n)} ${n === 1 ? one : other}`;

/** The English defaults */
export const DEFAULT_MESSAGES: MessageCatalogue = {
  steps: {
    upload: 'Upload',
    mapping: 'Match columns',
    review: 'Review and edit',
    resolution: 'Link records',
    import: 'Import',
  },
  upload: {
    helpText: 'Upload a spreadsheet with column names in the first row and one record per row after it.',
    dropHere: 'Drop your file here',
    dragAndDrop: 'Drag and drop a file here',
    accepted: 'You can upload: {types} (up to {maxSize})',
    chooseFile: 'Choose a file',
    unsupportedType: '{fileName} is not a supported file type. You can upload: {types}',
    tooLarge: '{fileName} is too large. The maximum file size is {maxSize}.',
    empty: 'The file appears to be empty or has no data rows.',
    unreadable: '{fileName} could not be read: {reason}',
  },
  mapping: {
    title: 'Map Columns',
    description: 'Match your file columns to the expected fields',
    mappedCount: '{mapped}/{total} mapped',
    autoMatched: 'Some columns were auto-matched. Review and adjust as needed.',
    autoBadge: 'Auto',
    selectField: 'Select field...',
    doNotImport: "Don't import",
    missingRequired: 'Missing required fields: {fields}',
    continue: 'Continue to Validation',
  },
  options: {
    loading: 'Loading the options for {fields}…',
    loadFailed: 'Could not load the options for {field}: {reason}',
    blocked: "The rows can't be reviewed or imported until the options load.",
    retry: 'Try again',
  },
  review: {
    title: 'Validate Data',
    description: 'Review, search, and fix data before importing',
    rowCount: (p) => plural(p.count, 'row', 'rows'),
    rowCountFiltered: (p) => `${count(p.visible)} of ${plural(p.total, 'row', 'rows')}`,
    filterValid: '{count} Valid',
    filterWarnings: '{count} Warnings',
    filterErrors: '{count} Errors',
    filterExcluded: '{count} Excluded',
    noSearchMatches: 'No rows match your search',
    noFilterMatches: 'No rows match the current filter',
    rowNumberHeader: '#',
    statusHeader: 'Status',
    excludeRow: 'Exclude row {row}',
    includeRow: 'Include row {row}',
    excludeRowHint: 'Leave this row out of the import',
    includeRowHint: 'Include this row in the import again',
    excludedStatus: 'Excluded',
    cellLabel: '{field}, row {row}',
    excludeErrors: 'Exclude Errors',
    excludeErrorsHint: 'Leave every row that still has errors out of the import',
    fillRequired: 'Fill Required',
    fillRequiredHint: 'Fill empty required fields with placeholder values',
    fillPlaceholder: 'N/A',
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Shift+Z)',
    back: 'Back to Mapping',
    excludedCount: '{count} excluded',
    complete: (p) => `Complete Import (${plural(p.count, 'row', 'rows')})`,
    continueToResolution: (p) => `Link related records (${plural(p.count, 'row', 'rows')})`,
  },
  commit: {
    title: 'Importing your rows',
    progress: (p) => `${count(p.done)} of ${plural(p.total, 'row', 'rows')} processed`,
    progressLabel: 'Import progress',
    keepOpen: 'Keep this page open until the import finishes.',
    retrying: 'Connection problem, retrying… (attempt {attempt} of {attempts})',
    notSent: (p) =>
      p.attempts > 1
        ? `This row could not be sent: the server could not be reached, even after ${count(p.attempts)} tries. Try importing it again later.`
        : 'This row could not be sent: the server could not be reached. Try importing it again later.',
    invalidAnswer: 'No clear answer was received for this row, so it was not counted as imported.',
    noReason: 'Refused without a reason.',
  },
  resolution: {
    title: 'Link related records',
    description:
      'Every name in your file is listed once. Names already in the system are linked to the existing record; the others are created when you import. Nothing is saved until then.',
    loading: 'Looking up {fields}…',
    lookupFailed: 'Could not look up {fields}: {reason}',
    invalidLookup: 'The answer could not be read.',
    blocked: "The rows can't be imported until the lookup succeeds.",
    retry: 'Try again',
    kindTitle: '{fields}',
    empty: 'No names to link: these columns are empty in every row being imported.',
    matchedTitle: 'Matched existing ({count})',
    matchedDescription: 'Already in the system: these rows will be linked to the existing record.',
    createTitle: 'Will be created ({count})',
    createDescription:
      'Not in the system yet: a new record is created for each when you import, with the name shown. You can change it.',
    undecidedTitle: 'Needs a decision ({count})',
    undecidedDescription:
      'These names could not be decided yet. Go back and change these names, or exclude their rows.',
    homonyms: '{count} records have this name:',
    homonymsTitle: 'Several matches ({count})',
    homonymsDescription:
      'More than one existing record has each of these names. Choose which one each name means, or create a new record. You can choose differently for individual rows.',
    homonymChoice: 'Which record is {value}?',
    createNew: 'Create a new record',
    perRow: (p) => `Choose for each row (${plural(p.count, 'row', 'rows')})`,
    perRowCount: (p) => `${plural(p.count, 'row', 'rows')} chosen individually`,
    rowLabel: (p) => (p.title ? `Row ${p.row}: ${p.title}` : `Row ${p.row}`),
    rowChoice: 'Record for {value} in row {row}',
    rowDefault: 'Same as above',
    possible: 'Might be the same as:',
    possibleTitle: 'Possibly the same ({count})',
    possibleDescription:
      'These names might be another name in your file written differently, or a record already in the system. They are kept separate unless you merge them.',
    mergeWithValue: 'Merge with {name}, also in your file',
    mergeWithRecord: (p) =>
      p.description ? `Merge with ${p.name} (${p.description}), already in the system` : `Merge with ${p.name}, already in the system`,
    keepSeparate: 'Keep separate',
    candidate: (p) => (p.description ? `${p.name} (${p.description})` : p.name),
    rowCount: (p) => `Used in ${plural(p.count, 'row', 'rows')}`,
    spellings: 'In your file: {spellings}',
    spelling: '{text} ×{count}',
    nameLabel: 'Name of the new record for {value}',
    nameRequired: 'Enter a name for the new record.',
    back: 'Back to Review',
    complete: (p) => `Complete Import (${plural(p.count, 'row', 'rows')})`,
    blockedUndecided: (p) =>
      p.count === 1
        ? '1 name needs a decision before you can import.'
        : `${count(p.count)} names need a decision before you can import.`,
    blockedUnnamed: 'Give every new record a name before you can import.',
    badgeLinked: (p) => (p.description ? `${p.name} (${p.description})` : p.name),
    badgeNew: 'New: {name}',
    badgeUndecided: 'Needs a decision',
    notCreated: 'The record "{name}" could not be created: {reason}',
    invalidId: 'No ID was received for the new record.',
  },
  report: {
    title: 'Import finished',
    created: '{count} imported',
    rejected: '{count} rejected',
    excluded: '{count} excluded',
    rejectedTitle: 'Rejected rows',
    rejectedDescription: 'These rows were not imported.',
    excludedTitle: 'Excluded rows',
    excludedDescription: 'You left these rows out of the import, so they were not sent.',
    rowHeader: 'Row',
    fieldHeader: 'Field',
    reasonHeader: 'Reason',
    download: 'Download rejected rows',
    downloadHint:
      'This report is not kept once you leave. Download the rejected rows to fix them in your spreadsheet and import them again.',
    downloadFileName: '{fileName} - rejected rows',
    downloadSheetName: 'Rejected rows',
    downloadErrorHeader: 'Error',
    downloadError: '{reason}',
    downloadFieldError: '{field}: {reason}',
  },
  cell: {
    empty: 'empty',
    clear: 'Clear',
    save: 'Save',
    cancel: 'Cancel',
  },
  search: {
    placeholder: 'Search in data...',
    clear: 'Clear search',
    matchCount: (p) => plural(p.count, 'match', 'matches'),
  },
  findReplace: {
    open: 'Find & Replace',
    title: 'Find and Replace',
    description: 'Search and replace text across all data cells. Use Ctrl+Enter to replace.',
    find: 'Find',
    findPlaceholder: 'Text to find...',
    replace: 'Replace with',
    replacePlaceholder: 'Replacement text (leave empty to delete)',
    column: 'In column',
    allColumns: 'All columns',
    caseSensitive: 'Case sensitive',
    wholeWord: 'Whole word',
    willUpdate: (p) => `${plural(p.count, 'cell', 'cells')} will be updated`,
    noMatches: 'No matches found',
    replaced: (p) => `Replaced ${plural(p.count, 'cell', 'cells')}`,
    close: 'Close',
    replaceAll: 'Replace All',
  },
  export: {
    menu: 'Export',
    csv: 'Export as CSV',
    excel: 'Export as Excel',
    validOnly: 'Export valid rows only (Excel)',
    fileName: 'data-export',
    validFileName: 'data-export-valid',
    sheetName: 'Data',
  },
  aiEdit: {
    open: 'AI Edit',
    placeholder: 'Describe how to edit the data...',
    send: 'Send',
    examplesLabel: 'Try:',
    examples: [
      'Capitalize all titles',
      'Trim whitespace from all fields',
      'Fix common spelling mistakes',
      'Standardize currency to USD',
    ].join('\n'),
    working: 'Analyzing data and generating edits...',
    failed: 'An unexpected error occurred',
    noChanges: 'No changes needed for "{command}"',
    command: '"{command}"',
    willEdit: (p) => `${plural(p.count, 'row', 'rows')} will be edited`,
    previewRow: 'Row {row}: {changes}',
    previewChange: '{field}="{value}"',
    more: '...and {count} more',
    cancel: 'Cancel',
    apply: 'Apply Changes',
    dismiss: 'Dismiss',
  },
  validation: {
    required: '{field} is required',
    invalidDate: '{field} is not a valid date (use {format} or YYYY-MM-DD)',
    notAnOption: '{field} must be one of: {options}',
    notAnOptionAndMore: '{field} must be one of: {options} and {more} more',
    optionsNotLoaded: 'The options for {field} are not loaded',
    noOptions: '{field} has no options to choose from',
    amountWithoutCurrency: 'Value amount provided without currency',
    currencyWithoutAmount: 'Currency provided without value amount',
    numericOnly: '{field} appears to be numeric only',
  },
};

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Fill a template's `{name}` placeholders from `params`. Numbers are shown
 * with the runtime's locale (`10,000`); placeholders without a parameter are
 * left as they are.
 */
export function interpolate(template: string, params: object | undefined): string {
  if (!params) return template;
  const values = params as Record<string, unknown>;
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    if (!(name in values)) return placeholder;
    const value = values[name];
    return typeof value === 'number' ? value.toLocaleString() : String(value);
  });
}

function toFormatter(entry: unknown): (params?: object) => string {
  if (typeof entry === 'function') return entry as (params?: object) => string;
  const template = String(entry);
  return (params) => interpolate(template, params);
}

function resolveOver(base: Record<string, Record<string, unknown>>, overrides: PartialMessageCatalogue) {
  const resolved: Record<string, Record<string, unknown>> = {};
  for (const [group, entries] of Object.entries(base)) {
    const groupOverrides = (overrides as Record<string, Record<string, unknown> | undefined>)[group];
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(entries)) {
      const override = groupOverrides?.[key];
      out[key] = override === undefined || override === null ? toFormatter(entry) : toFormatter(override);
    }
    resolved[group] = out;
  }
  return resolved as ResolvedMessages;
}

/** The English defaults, resolved */
export const ENGLISH_MESSAGES: ResolvedMessages = resolveOver(
  DEFAULT_MESSAGES as unknown as Record<string, Record<string, unknown>>,
  {}
);

/**
 * Turn a Host App's partial catalogue into one where every entry is a
 * function. Missing entries come from `base`: the English defaults unless
 * given (e.g. an enclosing wizard's catalogue).
 */
export function resolveMessages(
  overrides?: PartialMessageCatalogue,
  base: ResolvedMessages = ENGLISH_MESSAGES
): ResolvedMessages {
  if (!overrides) return base;
  return resolveOver(base as unknown as Record<string, Record<string, unknown>>, overrides);
}

/** A validation error or warning, as Data Weaver raises it: English text plus its catalogue key */
export function validationIssue<R extends ValidationMessageRef>(
  field: string,
  ref: R
): { field: string; message: string; messageRef: R } {
  return { field, message: issueText(ENGLISH_MESSAGES, { message: '', messageRef: ref }), messageRef: ref };
}

/**
 * The text of a validation error or warning in a resolved catalogue's
 * language: Data Weaver's own messages (with a `messageRef`) are translated,
 * the Host App's validators' messages are returned as written.
 */
export function issueText(
  messages: ResolvedMessages,
  issue: { message: string; messageRef?: ValidationMessageRef }
): string {
  if (!issue.messageRef) return issue.message;
  const format = messages.validation[issue.messageRef.key] as (params: object) => string;
  return format(issue.messageRef.params);
}

/**
 * The text of a validation error or warning in the Host App's language.
 * Messages Data Weaver raised (with a `messageRef`) are translated with
 * `messages`, falling back to English; messages from the Host App's own
 * validators are returned as they are.
 */
export function formatValidationMessage(
  issue: { message: string; messageRef?: ValidationMessageRef },
  messages?: PartialMessageCatalogue
): string {
  return issueText(resolveMessages(messages), issue);
}

/** Every catalogue key as `group.key`, e.g. `review.rowCount` */
export function messageKeys(): string[] {
  return Object.entries(DEFAULT_MESSAGES).flatMap(([group, entries]) =>
    Object.keys(entries).map((key) => `${group}.${key}`)
  );
}
