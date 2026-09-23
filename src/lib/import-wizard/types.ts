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
 * any row of the batch.
 */
export type SaveBatch<TRecord = ArtworkRecord> = (rows: ImportRow<TRecord>[]) => Promise<RowOutcome[]>;

/** What the Host App supplies so Data Weaver can Commit an import */
export interface HostAppAdapter<TRecord = ArtworkRecord> {
  saveBatch: SaveBatch<TRecord>;
}

/**
 * Why a row became a Rejected Row:
 * - `host`: the Host App answered `rejected`;
 * - `notSent`: its batch's promise rejected, so the row may not have reached the Host App;
 * - `invalidAnswer`: the Host App's answer had no valid outcome for the row
 *   (missing, repeated or malformed), so it is not counted as imported.
 */
export type RejectionCause = 'host' | 'notSent' | 'invalidAnswer';

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

/** `commit` while rows are being saved, `report` for the Import Report after it */
export type WizardStep = 'upload' | 'mapping' | 'validation' | 'commit' | 'report';

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
  /** Commit began: `rows` will be sent in `batches`; `excluded` rows will not */
  | { type: 'COMMIT_STARTED'; rows: number; batches: number; excluded: number }
  /** A batch has its outcome, whether the Host App answered or the batch could not be sent */
  | {
      type: 'BATCH_SETTLED';
      progress: CommitProgress;
      created: ImportRow<TRecord>[];
      rejected: RejectedRow<TRecord>[];
    }
  /** Commit is over; the same report `onImportFinished` receives */
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
   */
  adapter: HostAppAdapter<TRecord>;

  /**
   * Most rows sent in one `saveBatch` call. Values below 1 or not a number
   * fall back to the default; fractions are rounded down.
   * @default 100
   */
  batchSize?: number;

  /**
   * Called once when Commit is over, with the Import Report: the rows the
   * Host App saved, the Rejected Rows with their reasons and the Excluded Rows.
   */
  onImportFinished?: (report: ImportReport<TRecord>) => void;

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
