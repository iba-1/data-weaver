// Main export file for the import wizard library
export { ImportWizard } from './ImportWizard';
export { FileUploader } from './FileUploader';
export { ColumnMapper } from './ColumnMapper';
export { DataValidator } from './DataValidator';

// Re-export types
export type {
  ArtworkRecord,
  TargetField,
  TargetFieldConfig,
  ParsedFileData,
  ColumnMapping,
  RowValidation,
  ValidationError,
  ValidationWarning,
  WizardStep,
  ImportWizardState,
  ImportWizardEvent,
  ImportWizardProps,
} from '@/lib/import-wizard/types';

export { TARGET_FIELDS } from '@/lib/import-wizard/types';

// Re-export utilities for advanced usage
export { parseFile, getFileTypeFromName, isValidFileType } from '@/lib/import-wizard/parser';
export { autoMatchColumns, updateMapping, getUnmappedTargetFields } from '@/lib/import-wizard/matcher';
export { validateRows, revalidateRow, getValidationSummary } from '@/lib/import-wizard/validator';
