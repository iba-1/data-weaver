/**
 * React Import Wizard
 * 
 * A powerful, fully-featured data import wizard for React applications.
 * 
 * @packageDocumentation
 * @module react-import-wizard
 * 
 * @example
 * ```tsx
 * import { ImportWizard } from 'react-import-wizard';
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

/** Drag-and-drop file upload with validation */
export { FileUploader } from './FileUploader';

/** Column mapping interface with auto-matching */
export { ColumnMapper } from './ColumnMapper';

/** Data review with editing, search, and export */
export { DataValidator } from './DataValidator';

/** Search input with match counter */
export { SearchBar } from './SearchBar';

/** Find and replace dialog with options */
export { FindReplaceDialog, type ReplaceOptions } from './FindReplaceDialog';

/** Editable cell with keyboard support */
export { EditableCell } from './EditableCell';

// ============================================================
// TYPES
// ============================================================

export type {
  // Field Configuration
  FieldConfig,
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
  /** Parse CSV/Excel file into structured data */
  parseFile, 
  /** Get file type from filename */
  getFileTypeFromName, 
  /** Check if file type is supported */
  isValidFileType 
} from '@/lib/import-wizard/parser';

// Column Matching
export { 
  /** Auto-match source columns to target fields using fuzzy matching */
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
  getValidationSummary 
} from '@/lib/import-wizard/validator';

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
