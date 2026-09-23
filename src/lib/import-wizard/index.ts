/**
 * Data Weaver - core logic (`data-weaver/core`)
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
  FieldType,
  ChoiceOption,
  ChoiceOptionsLoader,
  RelationshipConfig,
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

  // Component Props
  ImportWizardProps,
  
  // Legacy (backwards compatibility)
  ArtworkRecord,
  TargetField,
  TargetFieldConfig,
} from './types';

export { TARGET_FIELDS, ARTWORK_FIELD_CONFIGS } from './types';

// ============================================================
// MESSAGE CATALOGUE
// ============================================================

export {
  DEFAULT_MESSAGES,
  formatValidationMessage,
  type MessageCatalogue,
  type PartialMessageCatalogue,
  type MessageEntry,
  type MessageParams,
  type ValidationMessageRef,
} from './messages';

// ============================================================
// PARSING
// ============================================================

export {
  parseFile,
  getFileTypeFromName,
  isValidFileType,
  checkUpload,
  DEFAULT_ACCEPTED_FILE_TYPES,
  DEFAULT_MAX_FILE_SIZE,
  type UploadRules,
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

// ============================================================
// REVIEW: VALUES, EDITS, SEARCH
// ============================================================

export { cellText, parseNumber } from './values';

export { applyRowEdits, coerceEditedValue } from './edits';

export {
  matchesSearch,
  rowMatchesSearch,
  countSearchMatches,
  matchesFind,
  replaceInText,
  countFindMatches,
  findReplaceEdits,
  countEditedCells,
} from './search';

export { parseCalendarDate, formatCalendarDate, type DateOrder } from './dates';

// ============================================================
// NORMALISED MATCH & CHOICE FIELDS
// ============================================================

export { normaliseForMatch, isNormalisedMatch } from './normalise';

export { matchChoice, loadChoiceOptions, hasOptionLoaders, OptionsLoadError } from './choices';

// ============================================================
// COMMIT
// ============================================================

export {
  commitRows,
  settleBatch,
  createImportKey,
  createImportKeys,
  DEFAULT_BATCH_SIZE,
  DEFAULT_RETRY,
  type BatchResult,
  type CommitOptions,
  type CommitOutcome,
} from './commit';

// ============================================================
// RESOLUTION: RELATIONSHIP FIELDS AND RELATED RECORDS
// ============================================================

export {
  relationshipKinds,
  hasRelationshipFields,
  collectRelatedValues,
  preferredSpelling,
  relatedValueKey,
  settleLookup,
  lookupRelated,
  RelatedLookupError,
  classifyCandidates,
  resolveValues,
  resolutionBlockers,
  decisionForRow,
  decisionsInEffect,
  isValueDecided,
  type RelationshipKind,
  type Spelling,
  type RelatedValue,
  type LookupResults,
  type ResolutionGroup,
  type RelatedDecision,
  type ResolvedValue,
  type ResolveOptions,
  type PossibleMatch,
  type MergeTarget,
  type CommittedValue,
} from './resolution';

export { findPossibleMatches, isPossibleMatch, matchWords, type PossiblePair } from './possible';

export {
  planRelatedCreations,
  createRelatedRecords,
  substituteRelatedIds,
  type RelatedCreation,
  type CreatedRelated,
  type CreateRelatedOptions,
  type SubstitutedRows,
} from './related';

// ============================================================
// EXPORT
// ============================================================

export {
  exportData,
  exportToBlob,
  rejectedRowsSheet,
  rejectedRowsFormat,
  sheetToBlob,
  type ExportOptions,
  type RejectedRowsSheetInput,
  type SheetFormat,
} from './exporter';
