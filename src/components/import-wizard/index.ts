/**
 * Data Weaver
 *
 * A spreadsheet import wizard for React: upload, map columns, review and fix rows,
 * then save them through the Host App and report the outcome.
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
 *       adapter={{ saveBatch: (rows) => api.saveRows(rows) }}
 *       onImportFinished={(report) => console.log(report.created.length, 'imported')}
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

/** Styling scope, tooltips, portals and the message catalogue; wrap sub-components used on their own */
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
  RelationshipConfig,
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

  // Commit: the Host App adapter and the Import Report
  HostAppAdapter,
  SaveBatch,
  FindRelated,
  CreateRelated,
  RelatedCandidate,
  RelatedRecordId,
  ImportRow,
  RowOutcome,
  RejectedRow,
  RowRejection,
  RejectionCause,
  CommitProgress,
  RetryOptions,
  BatchRetry,
  ImportReport,

  // State & Props
  WizardStep,
  ImportWizardState,
  ImportWizardProps,
  
  // Legacy (backwards compatible)
  ArtworkRecord,
  TargetField,
  TargetFieldConfig,
} from '@/lib/import-wizard/types';

// ============================================================
// MESSAGE CATALOGUE
// ============================================================

export {
  /** The English defaults of every piece of text the Importer sees */
  DEFAULT_MESSAGES,
  /** A validation error or warning's text in a catalogue's language */
  formatValidationMessage,
  type MessageCatalogue,
  type PartialMessageCatalogue,
  type MessageEntry,
  type MessageParams,
  type ValidationMessageRef,
} from '@/lib/import-wizard/messages';

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
  /** What loadChoiceOptions rejects with: the field's label and the reason */
  OptionsLoadError,
  /** Whether any choice field still has an options loader */
  hasOptionLoaders,
} from '@/lib/import-wizard/choices';

// Commit
export {
  /** Send rows to a Host App's saveBatch in batches, one at a time, with per-row outcomes */
  commitRows,
  /** Check a Host App's answer to a batch: one valid outcome per row, or the row is rejected */
  settleBatch,
  /** A new Import Key (a random UUID) */
  createImportKey,
  /** One Import Key per row */
  createImportKeys,
  DEFAULT_BATCH_SIZE,
  DEFAULT_RETRY,
  type BatchResult,
  type CommitOptions,
  type CommitOutcome,
} from '@/lib/import-wizard/commit';

// Resolution
export {
  /** The Output Shape's Relationship Fields, grouped by the kind of Related Record */
  relationshipKinds,
  /** Every distinct Relationship Field value per kind, grouped by Normalised Match, with spellings and rows */
  collectRelatedValues,
  /** The stored name for a new Related Record: most frequent spelling, preferring accented */
  preferredSpelling,
  /** Look up one kind's values with a Host App's findRelated, checking the answer */
  lookupRelated,
  /** Decide what can be decided without the Importer: one Normalised Match links, none creates */
  resolveValues,
  /** What still stops Commit: values not looked up, undecided, or new records without a name */
  resolutionBlockers,
  relatedValueKey,
  RelatedLookupError,
  type RelatedValue,
  type ResolvedValue,
  type ResolutionGroup,
  type RelatedDecision,
  type LookupResults,
  type PossibleMatch,
  type MergeTarget,
  type CommittedValue,
} from '@/lib/import-wizard/resolution';

export {
  /** Pairs of values of the file that might be the same Related Record (word order, punctuation, initials) */
  findPossibleMatches,
  /** Whether two values might be the same Related Record without being a Normalised Match */
  isPossibleMatch,
  type PossiblePair,
} from '@/lib/import-wizard/possible';

export {
  /** The new Related Records a Commit creates, once each */
  planRelatedCreations,
  /** Create them with a Host App's createRelated, one at a time */
  createRelatedRecords,
  /** Put Related Record IDs in place of names; rows pointing to a record not created are rejected */
  substituteRelatedIds,
  type RelatedCreation,
  type CreatedRelated,
} from '@/lib/import-wizard/related';

// Export
export {
  /** Export validated rows to CSV or Excel format */
  exportData, 
  /** Generate a blob for download */
  exportToBlob,
  type ExportOptions,
  /** The Rejected Rows as a sheet to fix and import again */
  rejectedRowsSheet,
  /** The format to download the Rejected Rows in */
  rejectedRowsFormat,
  /** Write a sheet as an Excel or CSV file */
  sheetToBlob,
  type RejectedRowsSheetInput,
  type SheetFormat,
} from '@/lib/import-wizard/exporter';

// Hooks
export { useHistory } from '@/hooks/useHistory';
