/**
 * React Import Wizard - Core Library
 * 
 * This module exports all core logic functions for parsing, matching,
 * validating, and exporting data. Use these for custom implementations
 * or when you need more control than the high-level components provide.
 */

// ============================================================
// TYPES
// ============================================================

export type {
  // Field Configuration
  FieldConfig,
  ValidationResult,
  DataRecord,
  
  // Parsed Data
  ParsedFileData,
  
  // Column Mapping
  ColumnMapping,
  
  // Validation
  RowValidation,
  ValidationError,
  ValidationWarning,
  
  // Wizard State
  WizardStep,
  ImportWizardState,
  
  // Events
  RowParseEvent,
  RowCompleteEvent,
  ImportWizardEvent,
  
  // Edits & results
  RowEdit,
  AiEditRequest,
  AiEditHandler,
  ImportResult,

  // Component Props
  ImportWizardProps,
  
  // Legacy (backwards compatibility)
  ArtworkRecord,
  TargetField,
  TargetFieldConfig,
} from './types';

export { TARGET_FIELDS, ARTWORK_FIELD_CONFIGS } from './types';

// ============================================================
// PARSING
// ============================================================

export { 
  parseFile,
  getFileTypeFromName,
  isValidFileType,
} from './parser';

// ============================================================
// COLUMN MATCHING
// ============================================================

export {
  autoMatchColumns,
  getUnmappedTargetFields,
  updateMapping,
} from './matcher';

// ============================================================
// VALIDATION
// ============================================================

export {
  validateRows,
  revalidateRow,
  getValidationSummary,
  resolveRequiredKeys,
  markRequiredFields,
} from './validator';

export { applyRowEdits, coerceEditedValue } from './edits';

// ============================================================
// EXPORT
// ============================================================

export {
  exportData,
  exportToBlob,
  type ExportOptions,
} from './exporter';
