/**
 * Data Weaver
 *
 * A spreadsheet import wizard for React: upload, map columns, review and fix rows.
 *
 * @packageDocumentation
 * @module data-weaver
 *
 * @example
 * ```tsx
 * import { ImportWizard } from 'data-weaver';
 * import 'data-weaver/styles.css';
 *
 * function App() {
 *   return (
 *     <ImportWizard
 *       fields={[
 *         { key: 'name', label: 'Name', type: 'string', required: true },
 *         { key: 'email', label: 'Email', type: 'string' },
 *       ]}
 *       onComplete={(data) => console.log(data)}
 *     />
 *   );
 * }
 * ```
 */

// ============================================================
// COMPONENTS
// ============================================================

/** Main wizard component - orchestrates the 3-step import flow */
export { ImportWizard } from './ImportWizard';

/** Styling scope, tooltips and portals; wrap sub-components used on their own */
export { WizardRoot } from './WizardRoot';

/** Drag-and-drop file upload with validation */
export { FileUploader } from './FileUploader';

/** Column mapping interface with auto-matching */
export { ColumnMapper } from './ColumnMapper';

/** Data review with editing, search, and export */
export { DataValidator } from './DataValidator';

/** Search input with match counter */
export { SearchBar } from './SearchBar';

/** Find and replace dialog with options */
export { FindReplaceDialog } from './FindReplaceDialog';

/** AI Edit chat; calls the Host App-supplied `aiEdit` handler */
export { AiEditChat } from './AiEditChat';

/** Editable cell with keyboard support */
export { EditableCell } from './EditableCell';

/** Choice field cell edited with a picker of its options */
export { ChoiceCell } from './ChoiceCell';

// ============================================================
// TYPES
// ============================================================

export type {
  // Field Configuration
  FieldConfig,
  FieldType,
  ChoiceOption,
  ChoiceOptionsLoader,
  DataRecord,
  ValidationResult,
  
  // Events
  RowParseEvent,
  RowCompleteEvent,
  ImportWizardEvent,
  
  // Data Structures
  ParsedFileData,
  ColumnMapping,
  RowValidation,
  ValidationError,
  ValidationWarning,
  
  // Edits & results
  RowEdit,
  ReplaceOptions,
  AiEditRequest,
  AiEditHandler,
  ImportResult,

  // State & Props
  WizardStep,
  ImportWizardState,
  ImportWizardProps,
  
  // Legacy (backwards compatible)
  ArtworkRecord,
  TargetField,
  TargetFieldConfig,
} from '@/lib/import-wizard/types';

/** Default artwork field configurations (for backwards compatibility) */
export { TARGET_FIELDS, ARTWORK_FIELD_CONFIGS } from '@/lib/import-wizard/types';

// ============================================================
// UTILITIES
// ============================================================

// Parsing
export {
  /** Parse a CSV or Excel file into structured data */
  parseFile,
  /** Get file type from filename */
  getFileTypeFromName,
  /** Check if the parser reads this file type (.csv, .xlsx, .xls) */
  isValidFileType,
  /** Check a file against accepted types and maximum size; returns a message or null */
  checkUpload,
  DEFAULT_ACCEPTED_FILE_TYPES,
  DEFAULT_MAX_FILE_SIZE,
  type UploadRules,
} from '@/lib/import-wizard/parser';

// Column Matching
export { 
  /** Auto-match source columns to target fields by keyword similarity */
  autoMatchColumns, 
  /** Update a column mapping */
  updateMapping, 
  /** Get fields that haven't been mapped yet */
  getUnmappedTargetFields 
} from '@/lib/import-wizard/matcher';

// Validation
export { 
  /** Validate all rows using the column mappings */
  validateRows, 
  /** Revalidate a single row (after editing) */
  revalidateRow, 
  /** Get validation summary statistics */
  getValidationSummary,
  /** Resolve which field keys a row must fill in */
  resolveRequiredKeys,
} from '@/lib/import-wizard/validator';

// Dates
export {
  /** Read a cell value as a calendar date (a Date at midnight UTC) */
  parseCalendarDate,
  /** Show a calendar date as YYYY-MM-DD */
  formatCalendarDate,
  type DateOrder,
} from '@/lib/import-wizard/dates';

// Normalised Match & choice fields
export {
  /** Normalise a value for comparing: accents stripped, lowercased, whitespace collapsed and trimmed */
  normaliseForMatch,
  /** Whether two values are equal once case, extra spaces and accents are ignored */
  isNormalisedMatch,
} from '@/lib/import-wizard/normalise';

export {
  /** The canonical value of the option a value is a Normalised Match of, or null */
  matchChoice,
  /** Call every choice field's options loader once; resolves to the fields with their options */
  loadChoiceOptions,
  /** Whether any choice field still has an options loader */
  hasOptionLoaders,
} from '@/lib/import-wizard/choices';

// Export
export {
  /** Export validated rows to CSV or Excel format */
  exportData, 
  /** Generate a blob for download */
  exportToBlob, 
  type ExportOptions 
} from '@/lib/import-wizard/exporter';

// Hooks
export { useHistory } from '@/hooks/useHistory';
