// ============================================================
// CONFIGURABLE IMPORT WIZARD TYPES
// ============================================================

/**
 * Configuration for a single target field/column
 */
export interface FieldConfig<TKey extends string = string> {
  /** Unique identifier for this field */
  key: TKey;
  /** Display label shown in the UI */
  label: string;
  /** Whether this field is required for a valid row */
  required?: boolean;
  /** Data type for parsing and validation */
  type: 'string' | 'number' | 'date' | 'boolean';
  /** Keywords for fuzzy auto-matching source columns */
  matchKeywords?: string[];
  /** Custom validation function */
  validate?: (value: unknown, row: Record<string, unknown>) => ValidationResult | null;
  /** Transform value after parsing */
  transform?: (value: unknown) => unknown;
  /** Placeholder shown when value is empty */
  placeholder?: string;
}

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
  fileType: 'csv' | 'excel' | 'pdf';
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
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

// ============================================================
// WIZARD STATE
// ============================================================

export type WizardStep = 'upload' | 'mapping' | 'validation';

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
  | { type: 'IMPORT_COMPLETED'; data: TRecord[] }
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
   * Required field keys. Rows missing these are marked invalid.
   * @default ['title', 'artist']
   */
  requiredFields?: TKey[];
  
  /**
   * Called when import is complete with valid rows
   */
  onComplete?: (data: TRecord[]) => void;
  
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
   * Custom validation function applied to each row
   */
  validateRow?: (data: TRecord, rowIndex: number) => ValidationResult[];
  
  /**
   * Title shown at the top of the wizard
   * @default 'Import Data'
   */
  title?: string;
  
  /**
   * Description shown below the title
   */
  description?: string;
  
  /**
   * Accepted file types
   * @default ['.csv', '.xlsx', '.xls']
   */
  acceptedFileTypes?: string[];
  
  /**
   * Maximum file size in bytes
   * @default 10485760 (10MB)
   */
  maxFileSize?: number;
  
  /**
   * Custom CSS class
   */
  className?: string;
}
