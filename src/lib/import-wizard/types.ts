// Target structure for artwork data
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

export const TARGET_FIELDS: TargetFieldConfig[] = [
  { key: 'title', label: 'Title', required: true, type: 'string' },
  { key: 'artist', label: 'Artist', required: true, type: 'string' },
  { key: 'period', label: 'Period', required: false, type: 'string' },
  { key: 'technique', label: 'Technique', required: false, type: 'string' },
  { key: 'valueAmount', label: 'Value Amount', required: false, type: 'number' },
  { key: 'valueCurrency', label: 'Value Currency', required: false, type: 'string' },
];

// Parsed file data
export interface ParsedFileData {
  headers: string[];
  rows: Record<string, unknown>[];
  fileName: string;
  fileType: 'csv' | 'excel' | 'pdf';
}

// Column mapping
export interface ColumnMapping {
  sourceColumn: string;
  targetField: TargetField | null;
  confidence: number; // 0-1 for auto-match confidence
  isAutoMatched: boolean;
}

// Validation result for a single row
export interface RowValidation {
  rowIndex: number;
  data: ArtworkRecord;
  originalData: Record<string, unknown>;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: TargetField;
  message: string;
}

export interface ValidationWarning {
  field: TargetField;
  message: string;
}

// Import wizard state
export type WizardStep = 'upload' | 'mapping' | 'validation';

export interface ImportWizardState {
  step: WizardStep;
  file: File | null;
  parsedData: ParsedFileData | null;
  columnMappings: ColumnMapping[];
  validatedRows: RowValidation[];
  isLoading: boolean;
  error: string | null;
}

// Events
export type ImportWizardEvent =
  | { type: 'FILE_PARSED'; data: ParsedFileData }
  | { type: 'COLUMNS_MAPPED'; mappings: ColumnMapping[] }
  | { type: 'DATA_VALIDATED'; rows: RowValidation[] }
  | { type: 'IMPORT_COMPLETED'; data: ArtworkRecord[] }
  | { type: 'ERROR'; error: string };

// Props for the main component
export interface ImportWizardProps {
  onComplete?: (data: ArtworkRecord[]) => void;
  onEvent?: (event: ImportWizardEvent) => void;
  requiredFields?: TargetField[];
  className?: string;
}
