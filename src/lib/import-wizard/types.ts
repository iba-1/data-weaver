/**
 * Data Weaver - type definitions
 */

import type { DateOrder } from './dates';
import type { PartialMessageCatalogue, ValidationMessageRef } from './messages';

// ============================================================
// CONFIGURABLE IMPORT WIZARD TYPES
// ============================================================

/**
 * Configuration for a single target field/column.
 * 
 * @typeParam TKey - String literal type for field keys
 * 
 * @example
 * ```typescript
 * const fields: FieldConfig<'name' | 'email'>[] = [
 *   { key: 'name', label: 'Full Name', type: 'string', required: true },
 *   { key: 'email', label: 'Email Address', type: 'string' },
 * ];
 * ```
 */
export interface FieldConfig<TKey extends string = string> {
  /** Unique identifier for this field */
  key: TKey;
  /** Display label shown in the UI */
  label: string;
  /** Whether this field is required for a valid row */
  required?: boolean;
  /**
   * Data type for parsing and validation. A `date` is a calendar day, given to
   * the Host App as a `Date` at midnight UTC. A `choice` is one of `options`,
   * given to the Host App as the option's `value`.
   */
  type: FieldType;
  /**
   * For `choice` fields: the accepted options, as a list or as a loader the
   * wizard calls once when the review step starts. A cell that is a Normalised
   * Match of an option's `value` or `label` becomes that option's `value`;
   * any other value is an error on the cell.
   */
  options?: ChoiceOption[] | ChoiceOptionsLoader;
  /**
   * For `date` fields: how numeric dates such as 01/02/2024 are read,
   * day-first (`'DMY'`) or month-first (`'MDY'`). Year-first ISO dates are
   * always read as year-month-day.
   * @default 'DMY'
   */
  dateOrder?: DateOrder;
  /**
   * Makes this a Relationship Field: its cells name a Related Record of this
   * kind (e.g. an author's Registry entry) rather than holding a plain value.
   * Before Commit, every distinct value of every field of the same kind is
   * resolved once, to an existing record or a new one, and the Host App
   * receives the Related Record's ID in this field instead of the name.
   * Use it with `type: 'string'`.
   */
  relationship?: RelationshipConfig;
  /** Keywords for fuzzy auto-matching source columns */
  matchKeywords?: string[];
  /** Custom validation function */
  validate?: (value: unknown, row: Record<string, unknown>) => ValidationResult | null;
  /** Transform value after parsing */
  transform?: (value: unknown) => unknown;
  /** Placeholder shown when value is empty */
  placeholder?: string;
}

/** How a field's cell text is converted and checked */
export type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'choice';

/** One accepted value of a `choice` field */
export interface ChoiceOption {
  /** The canonical value the Host App receives, e.g. `'EUR'` */
  value: string;
  /** What the Importer sees in the picker, e.g. `'Euro'`. Defaults to `value`. */
  label?: string;
}

/** What a Relationship Field points to */
export interface RelationshipConfig {
  /**
   * The kind of Related Record, e.g. `'registry'`. It is passed to the
   * adapter's `findRelated` and `createRelated`; fields of the same kind
   * (author, owner, lender) are resolved together.
   */
  kind: string;
}

/**
 * Host App-supplied loader for a `choice` field's options, e.g. a call to its
 * API. Rejecting with an Error shows its message to the Importer, who can
 * retry; the import can't complete until the options load.
 */
export type ChoiceOptionsLoader = () => Promise<ChoiceOption[]>;

/**
 * Result from a field validation function
 */
export interface ValidationResult {
  type: 'error' | 'warning';
  message: string;
}

/**
 * Generic record type based on field configuration
 */
export type DataRecord<TFields extends FieldConfig[]> = {
  [K in TFields[number]['key']]: TFields[number] extends { key: K; type: infer T }
    ? T extends 'number' ? number | null
    : T extends 'boolean' ? boolean | null
    : T extends 'date' ? Date | null
    : string | null
    : unknown;
};

// ============================================================
// LEGACY ARTWORK RECORD (for backwards compatibility)
// ============================================================

export interface ArtworkRecord {
  title: string | null;
  artist: string | null;
  period: string | null;
  technique: string | null;
  valueAmount: number | null;
  valueCurrency: string | null;
}

export type TargetField = keyof ArtworkRecord;

export interface TargetFieldConfig {
  key: TargetField;
  label: string;
  required: boolean;
  type: 'string' | 'number';
}

/** Default artwork fields for backwards compatibility */
export const TARGET_FIELDS: TargetFieldConfig[] = [
  { key: 'title', label: 'Title', required: true, type: 'string' },
  { key: 'artist', label: 'Artist', required: true, type: 'string' },
  { key: 'period', label: 'Period', required: false, type: 'string' },
  { key: 'technique', label: 'Technique', required: false, type: 'string' },
  { key: 'valueAmount', label: 'Value Amount', required: false, type: 'number' },
  { key: 'valueCurrency', label: 'Value Currency', required: false, type: 'string' },
];

/** Convert legacy TARGET_FIELDS to new FieldConfig format */
export const ARTWORK_FIELD_CONFIGS: FieldConfig<TargetField>[] = TARGET_FIELDS.map((f) => ({
  key: f.key,
  label: f.label,
  required: f.required,
  type: f.type,
  matchKeywords: getDefaultKeywords(f.key),
}));

function getDefaultKeywords(field: TargetField): string[] {
  const keywords: Record<TargetField, string[]> = {
    title: ['title', 'name', 'artwork', 'piece', 'work', 'obra', 'titulo', 'nombre'],
    artist: ['artist', 'author', 'creator', 'painter', 'sculptor', 'artista', 'autor'],
    period: ['period', 'era', 'year', 'date', 'century', 'time', 'epoca', 'periodo', 'año', 'fecha'],
    technique: ['technique', 'medium', 'material', 'style', 'method', 'tecnica', 'medio', 'estilo'],
    valueAmount: ['value', 'price', 'amount', 'cost', 'worth', 'estimate', 'valor', 'precio', 'monto'],
    valueCurrency: ['currency', 'curr', 'money', 'unit', 'moneda', 'divisa'],
  };
  return keywords[field];
}

// ============================================================
// PARSED FILE DATA
// ============================================================

export interface ParsedFileData {
  headers: string[];
  rows: Record<string, unknown>[];
  fileName: string;
  fileType: 'csv' | 'excel';
}

// ============================================================
// COLUMN MAPPING
// ============================================================

export interface ColumnMapping<TKey extends string = string> {
  sourceColumn: string;
  targetField: TKey | null;
  confidence: number;
  isAutoMatched: boolean;
}

// ============================================================
// VALIDATION
// ============================================================

export interface RowValidation<TRecord = ArtworkRecord> {
  rowIndex: number;
  data: TRecord;
  originalData: Record<string, unknown>;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  /** Set when the Importer deliberately left this row out of the import */
  excluded?: boolean;
}

export interface ValidationError {
  field: string;
  /**
   * The message as written. For messages Data Weaver raises itself this is
   * the English default; `messageRef` lets it be shown in another language.
   * Messages from the Host App's validators are passed through untouched.
   */
  message: string;
  /** Set on messages Data Weaver raises itself: their catalogue key and parameters */
  messageRef?: ValidationMessageRef;
}

export interface ValidationWarning {
  field: string;
  /** As for `ValidationError.message` */
  message: string;
  /** Set on messages Data Weaver raises itself: their catalogue key and parameters */
  messageRef?: ValidationMessageRef;
}

// ============================================================
// EDITS
// ============================================================

/**
 * A set of field changes to apply to one row. Every review change is one:
 * cell edits, find/replace and AI Edit.
 */
export interface RowEdit {
  rowIndex: number;
  changes: Record<string, unknown>;
}

/** How find/replace matches cell text */
export interface ReplaceOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  /** A field key, or 'all' for every field */
  selectedColumn: string;
}

/** What Data Weaver sends to the Host App's AI endpoint */
export interface AiEditRequest {
  /** The Importer's natural-language instruction */
  command: string;
  rows: Array<{ rowIndex: number; data: Record<string, unknown> }>;
  /** The fields; `choice` fields include their loaded options */
  fields: Array<Pick<FieldConfig, 'key' | 'label' | 'type'> & { options?: ChoiceOption[] }>;
}

/**
 * Host App-supplied AI Edit endpoint. Resolves to the edits to propose to the
 * Importer; rejects with an Error whose message is shown to the Importer.
 */
export type AiEditHandler = (request: AiEditRequest) => Promise<RowEdit[]>;

// ============================================================
// COMMIT: THE HOST APP ADAPTER AND THE IMPORT REPORT
// ============================================================

/**
 * A row of the import as the Host App sees it: its Import Key, its position in
 * the file and its record.
 */
export interface ImportRow<TRecord = ArtworkRecord> {
  /**
   * Data Weaver's unique identifier for this row, the same on every attempt to
   * save it. A Host App that has already saved a row with this key must not
   * save it again, and answers `created` (ADR-0002).
   */
  importKey: string;
  /** The row's position among the file's data rows, from 0; the Importer sees `rowIndex + 1` */
  rowIndex: number;
  /** The row's record, as reviewed by the Importer */
  record: TRecord;
}

/**
 * The Host App's answer for one row of a batch: saved, or refused with a
 * reason the Importer can act on. `reason` is the Host App's own text, in the
 * Importer's language; `field` is the key of the offending field, when known.
 */
export type RowOutcome =
  | { importKey: string; status: 'created' }
  | { importKey: string; status: 'rejected'; reason: string; field?: string };

/**
 * Saves one batch of rows. Must resolve with exactly one outcome per row sent,
 * matched by `importKey` (in any order), and must honour Import Keys: a row
 * whose key was already saved is not saved again and is answered `created`.
 * Rejecting the promise (e.g. a network error) means no outcome is known for
 * any row of the batch: Data Weaver sends the same rows, with the same Import
 * Keys, again (see `RetryOptions`).
 */
export type SaveBatch<TRecord = ArtworkRecord> = (rows: ImportRow<TRecord>[]) => Promise<RowOutcome[]>;

/** The Host App's identifier of a Related Record */
export type RelatedRecordId = string | number;

/**
 * An existing Related Record the Host App's lookup found for a value.
 * `match` says how it was found: `normalised` when its name is a Normalised
 * Match of the value (several of them are Homonyms), `possible` when it might
 * be the same record but is not a Normalised Match (e.g. `L. Fontana` for
 * `lucio fontana`). Possible Matches are never linked without the Importer.
 */
export interface RelatedCandidate {
  id: RelatedRecordId;
  /** The record's name as the Host App stores it */
  name: string;
  /** A short detail that tells Homonyms apart, e.g. a birth year; the Host App's own text */
  description?: string;
  match: 'normalised' | 'possible';
}

/**
 * Looks up existing Related Records of one kind. Called once per kind when
 * the Resolution step opens, with the distinct values of every field of that
 * kind in the whole file, each already normalised with the Normalised Match
 * rule (`normaliseForMatch`). Must resolve with an entry for every value sent,
 * keyed by that value: its candidates, or `[]` when there are none. Match
 * names with the same rule. Rejecting shows the Error's message to the
 * Importer, who can try again.
 */
export type FindRelated = (kind: string, values: string[]) => Promise<Record<string, RelatedCandidate[]>>;

/**
 * Creates one new Related Record of a kind, with the name the Importer
 * confirmed in Resolution, and resolves with its ID. Called at the start of
 * Commit, once per new record, one at a time, before any row is saved.
 * Rejecting with an Error means it was not created: the rows that point to
 * it become Rejected Rows, with the Error's message in their reason.
 */
export type CreateRelated = (kind: string, name: string) => Promise<RelatedRecordId>;

/** What the Host App supplies so Data Weaver can Commit an import */
export interface HostAppAdapter<TRecord = ArtworkRecord> {
  saveBatch: SaveBatch<TRecord>;
  /** Required when the Output Shape has Relationship Fields */
  findRelated?: FindRelated;
  /** Required when the Output Shape has Relationship Fields */
  createRelated?: CreateRelated;
}

/**
 * Why a row became a Rejected Row:
 * - `host`: the Host App answered `rejected`;
 * - `notSent`: its batch's promise rejected on every attempt (the server could
 *   not be reached), so the row may not have reached the Host App;
 * - `invalidAnswer`: the Host App's answer had no valid outcome for the row
 *   (missing, repeated or malformed), so it is not counted as imported;
 * - `relatedNotCreated`: a Related Record the row points to could not be
 *   created, so the row was never sent.
 */
export type RejectionCause = 'host' | 'notSent' | 'invalidAnswer' | 'relatedNotCreated';

/** A row the Host App did not save, and why */
export interface RejectedRow<TRecord = ArtworkRecord> extends ImportRow<TRecord> {
  /**
   * Why the row was not saved: the Host App's reason as given, or, when
   * Data Weaver rejected the row itself, its text from the message catalogue
   */
  reason: string;
  /** The key of the offending field, as given by the Host App */
  field?: string;
  cause: RejectionCause;
}

/** Why the Host App refused a row, as Fix & Retry shows it: on the field's cell, or the whole row */
export type RowRejection = Pick<RejectedRow<unknown>, 'reason' | 'field'>;

/** How far a Commit has got */
export interface CommitProgress {
  /** Rows with an outcome so far, saved or rejected */
  done: number;
  /** Rows being committed (Excluded Rows are not sent and not counted) */
  total: number;
  /** Batches with an outcome so far */
  batch: number;
  batches: number;
}

/**
 * How a batch that fails in transit (its `saveBatch` promise rejects, or the
 * call throws) is sent again. Retrying is safe because the rows keep their
 * Import Keys (ADR-0002). An answer that arrives but is invalid is never
 * retried: the Host App did answer, and asking again would not fix its adapter.
 */
export interface RetryOptions {
  /** Attempts per batch in total, the first included; `1` turns retrying off. @default 3 */
  attempts?: number;
  /** The wait before the first retry, in milliseconds; it doubles for each retry after it. @default 1000 */
  baseDelayMs?: number;
  /** The longest wait between two attempts, in milliseconds. @default 8000 */
  maxDelayMs?: number;
}

/** A batch failed in transit and will be sent again after `delayMs` */
export interface BatchRetry {
  /** The batch, from 1 */
  batch: number;
  batches: number;
  /** The attempt about to be made, from 2 */
  attempt: number;
  /** Attempts allowed in total */
  attempts: number;
  /** The wait before it, in milliseconds */
  delayMs: number;
  /** What the failed attempt rejected (or threw) with */
  error: unknown;
}

/**
 * The outcome of an import, shown to the Importer after Commit and given to
 * the Host App. Every row of the file is in exactly one list, in file order.
 */
export interface ImportReport<TRecord = ArtworkRecord> {
  /** Rows the Host App saved */
  created: ImportRow<TRecord>[];
  /** Rows the Host App refused, or that could not be saved, with the reason */
  rejected: RejectedRow<TRecord>[];
  /** Rows the Importer deliberately left out; they were never sent */
  excluded: ImportRow<TRecord>[];
}

// ============================================================
// WIZARD STATE
// ============================================================

/**
 * `resolution` between review and Commit when the Output Shape has
 * Relationship Fields, `commit` while rows are being saved, `report` for the
 * Import Report after it, `fix` for Fix & Retry (the Rejected Rows only)
 */
export type WizardStep = 'upload' | 'mapping' | 'validation' | 'resolution' | 'commit' | 'report' | 'fix';

export interface ImportWizardState<TRecord = ArtworkRecord> {
  step: WizardStep;
  file: File | null;
  parsedData: ParsedFileData | null;
  columnMappings: ColumnMapping[];
  validatedRows: RowValidation<TRecord>[];
  isLoading: boolean;
  error: string | null;
}

// ============================================================
// EVENTS & CALLBACKS
// ============================================================

/**
 * Event emitted during parsing - called for each row
 */
export interface RowParseEvent<TRecord = ArtworkRecord> {
  rowIndex: number;
  rawData: Record<string, unknown>;
  parsedData: TRecord;
}

/**
 * Event emitted when a row is validated/edited
 */
export interface RowCompleteEvent<TRecord = ArtworkRecord> {
  rowIndex: number;
  data: TRecord;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Lifecycle events during import
 */
export type ImportWizardEvent<TRecord = ArtworkRecord> =
  | { type: 'FILE_PARSED'; data: ParsedFileData }
  | { type: 'COLUMNS_MAPPED'; mappings: ColumnMapping[] }
  | { type: 'ROW_PARSED'; event: RowParseEvent<TRecord> }
  | { type: 'ROW_COMPLETE'; event: RowCompleteEvent<TRecord> }
  | { type: 'DATA_VALIDATED'; rows: RowValidation<TRecord>[] }
  /**
   * Commit began: `rows` will be sent in `batches`; `excluded` rows will not.
   * On a Fix & Retry, both count only that retry's rows.
   */
  | { type: 'COMMIT_STARTED'; rows: number; batches: number; excluded: number }
  /** A batch failed in transit and will be sent again, with the same Import Keys */
  | { type: 'BATCH_RETRY'; retry: BatchRetry }
  /** A batch has its outcome, whether the Host App answered or the batch could not be sent */
  | {
      type: 'BATCH_SETTLED';
      progress: CommitProgress;
      created: ImportRow<TRecord>[];
      rejected: RejectedRow<TRecord>[];
    }
  /** Commit (or a Fix & Retry) is over; the same cumulative report `onImportFinished` receives */
  | { type: 'IMPORT_FINISHED'; report: ImportReport<TRecord> }
  | { type: 'ERROR'; error: string };

// ============================================================
// COMPONENT PROPS
// ============================================================

/**
 * Props for the main ImportWizard component
 */
export interface ImportWizardProps<TRecord = ArtworkRecord, TKey extends string = TargetField> {
  /**
   * Column/field configuration. Defines what fields are available for mapping.
   * @default ARTWORK_FIELD_CONFIGS (title, artist, period, technique, valueAmount, valueCurrency)
   */
  fields?: FieldConfig<TKey>[];
  
  /**
   * Extra required field keys, on top of fields marked `required: true`.
   * Rows missing a required field are invalid.
   * @default []
   */
  requiredFields?: TKey[];
  
  /**
   * How the rows are saved. When the Importer imports, every included row is
   * sent to `adapter.saveBatch` in batches, one batch at a time. Excluded Rows
   * are never sent. The import cannot start while an included row is invalid.
   * When `fields` has Relationship Fields, it also needs `findRelated` (called
   * in the Resolution step) and `createRelated` (called at the start of
   * Commit, before any batch), and the rows carry Related Record IDs.
   */
  adapter: HostAppAdapter<TRecord>;

  /**
   * Most rows sent in one `saveBatch` call. Values below 1 or not a number
   * fall back to the default; fractions are rounded down.
   * @default 100
   */
  batchSize?: number;

  /**
   * How a batch whose `saveBatch` promise rejects is retried: by default 3
   * attempts in total, waiting about 1 s, then about 2 s (with jitter).
   * After the last attempt its rows become Rejected Rows (`notSent`).
   */
  retry?: RetryOptions;

  /**
   * Called when Commit is over, with the Import Report: the rows the Host
   * App saved, the Rejected Rows with their reasons and the Excluded Rows.
   * Called again after each Fix & Retry, with the report of every outcome so
   * far (rows created on any Commit, rows still rejected, rows excluded
   * before or during Fix & Retry): each call replaces the previous one.
   */
  onImportFinished?: (report: ImportReport<TRecord>) => void;

  /**
   * Called with `true` when leaving the wizard should be confirmed: there
   * are Rejected Rows not yet fixed (in the Import Report, in Fix & Retry or
   * while they are sent again), and the report is not kept once the
   * Importer leaves. Called with `false` when that is no longer so,
   * including when the wizard unmounts. Guard your router's navigation with
   * it (e.g. React Router's `useBlocker`); closing or reloading the tab is
   * already guarded by the wizard (`beforeunload`).
   */
  onLeaveWarningChange?: (warn: boolean) => void;

  /**
   * Called for each lifecycle event
   */
  onEvent?: (event: ImportWizardEvent<TRecord>) => void;
  
  /**
   * Called for each row as it's being parsed
   * Use for progress tracking or custom transformations
   */
  onRowParse?: (event: RowParseEvent<TRecord>) => TRecord | void;
  
  /**
   * Called when a row passes validation (after edit or initial validation)
   * Use for real-time sync or preview
   */
  onRowComplete?: (event: RowCompleteEvent<TRecord>) => void;
  
  /**
   * Custom validation function applied to each row, initially and after every edit
   */
  validateRow?: (data: TRecord, rowIndex: number) => ValidationResult[];

  /**
   * Enables AI Edit. The Host App supplies its own AI endpoint; without it the
   * AI Edit button is not shown.
   */
  aiEdit?: AiEditHandler;
  
  /**
   * Heading shown above the step indicator. There is no default: when the
   * wizard sits inside a Host App page that has its own heading, leave it out.
   */
  title?: string;

  /**
   * Text shown above the step indicator, below the title if there is one.
   * Nothing is shown when omitted.
   */
  description?: string;

  /**
   * File extensions the upload step accepts, e.g. `['.csv']`. Must be a subset
   * of what the parser reads: `.csv`, `.xlsx`, `.xls`. Other files are refused
   * with a message. Also sets the file picker's `accept` and the upload copy.
   * @default ['.csv', '.xlsx', '.xls']
   */
  acceptedFileTypes?: string[];

  /**
   * Maximum file size in bytes. Larger files are refused with a message.
   * @default 10485760 (10 MB)
   */
  maxFileSize?: number;

  /**
   * Text in the Importer's language. Pass any entries of the catalogue;
   * the rest fall back to English. Entries are strings with `{name}`
   * placeholders or functions of their parameters. Pass a stable object
   * (a constant, or memoised), not a new one on every render.
   * @default DEFAULT_MESSAGES (English)
   */
  messages?: PartialMessageCatalogue;
  
  /**
   * Custom CSS class
   */
  className?: string;
}
