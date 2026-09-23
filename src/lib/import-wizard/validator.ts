import type {
  ArtworkRecord,
  ColumnMapping,
  FieldConfig,
  RowValidation,
  TargetField,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from './types';
import { TARGET_FIELDS } from './types';
import { parseNumber } from './values';
import { invalidDateMessage, parseCalendarDate } from './dates';
import { checkChoice, coerceChoice } from './choices';

/**
 * Validate all rows using the column mappings
 */
export function validateRows<TRecord = ArtworkRecord, TKey extends string = TargetField>(
  rows: Record<string, unknown>[],
  mappings: ColumnMapping<TKey>[],
  options: {
    fields?: FieldConfig<TKey>[];
    requiredFields?: TKey[];
    customValidator?: (data: TRecord, rowIndex: number) => ValidationResult[];
    onRowParse?: (rowIndex: number, rawData: Record<string, unknown>, parsedData: TRecord) => TRecord | void;
  } = {}
): RowValidation<TRecord>[] {
  const { fields, requiredFields, customValidator, onRowParse } = options;
  
  return rows.map((row, index) => {
    const result = validateRow<TRecord, TKey>(row, mappings, {
      fields,
      requiredFields,
      customValidator,
      rowIndex: index,
    });
    
    // Allow transformation via onRowParse
    if (onRowParse) {
      const transformed = onRowParse(index, row, result.data);
      if (transformed) {
        result.data = transformed;
      }
    }
    
    return result;
  });
}

/**
 * The field keys a row must fill in to be valid.
 *
 * A field is required when its `FieldConfig.required` is set or it appears in
 * `requiredFields`. Only when no `fields` are given at all does the legacy
 * artwork configuration apply.
 */
export function resolveRequiredKeys<TKey extends string>(
  fields?: FieldConfig<TKey>[],
  requiredFields?: TKey[]
): TKey[] {
  const fromFields = fields
    ? fields.filter((f) => f.required).map((f) => f.key)
    : (TARGET_FIELDS.filter((f) => f.required).map((f) => f.key) as string[] as TKey[]);
  const keys = requiredFields ? [...fromFields, ...requiredFields] : fromFields;
  return Array.from(new Set(keys));
}

/**
 * Mark every field in `requiredFields` as required, so the fields are the
 * single source of truth for what a valid row needs.
 */
export function markRequiredFields<TKey extends string>(
  fields: FieldConfig<TKey>[],
  requiredFields?: TKey[]
): FieldConfig<TKey>[] {
  if (!requiredFields?.length) return fields;
  return fields.map((f) => (requiredFields.includes(f.key) ? { ...f, required: true } : f));
}

/**
 * Revalidate a single row (after editing)
 */
export function revalidateRow<TRecord = ArtworkRecord, TKey extends string = TargetField>(
  row: RowValidation<TRecord>,
  options: {
    fields?: FieldConfig<TKey>[];
    requiredFields?: TKey[];
    customValidator?: (data: TRecord, rowIndex: number) => ValidationResult[];
  } = {}
): RowValidation<TRecord> {
  const { fields, customValidator } = options;
  const requiredFields = resolveRequiredKeys(fields, options.requiredFields);
  
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const data = row.data as Record<string, unknown>;
  
  // Check required fields
  for (const fieldKey of requiredFields) {
    const value = data[fieldKey];
    if (value === null || value === undefined || value === '') {
      const fieldConfig = fields?.find((f) => f.key === fieldKey);
      errors.push({
        field: fieldKey,
        message: `${fieldConfig?.label || fieldKey} is required`,
      });
    }
  }
  
  errors.push(...checkFieldTypes(data, fields));

  // Run field-level validators
  if (fields) {
    for (const field of fields) {
      if (field.validate) {
        const result = field.validate(data[field.key], data);
        if (result) {
          if (result.type === 'error') {
            errors.push({ field: field.key, message: result.message });
          } else {
            warnings.push({ field: field.key, message: result.message });
          }
        }
      }
    }
  } else {
    // Legacy artwork-specific warnings
    const artworkData = data as unknown as ArtworkRecord;
    if (artworkData.valueAmount !== null && artworkData.valueCurrency === null) {
      warnings.push({
        field: 'valueCurrency',
        message: 'Value amount provided without currency',
      });
    }
    if (artworkData.valueCurrency !== null && artworkData.valueAmount === null) {
      warnings.push({
        field: 'valueAmount',
        message: 'Currency provided without value amount',
      });
    }
    if (artworkData.title && /^\d+$/.test(String(artworkData.title))) {
      warnings.push({
        field: 'title',
        message: 'Title appears to be numeric only',
      });
    }
    if (artworkData.artist && /^\d+$/.test(String(artworkData.artist))) {
      warnings.push({
        field: 'artist',
        message: 'Artist appears to be numeric only',
      });
    }
  }
  
  // Run custom row validator
  if (customValidator) {
    const customResults = customValidator(row.data, row.rowIndex);
    for (const result of customResults) {
      if (result.type === 'error') {
        errors.push({ field: '', message: result.message });
      } else {
        warnings.push({ field: '', message: result.message });
      }
    }
  }
  
  return {
    ...row,
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateRow<TRecord, TKey extends string>(
  row: Record<string, unknown>,
  mappings: ColumnMapping<TKey>[],
  options: {
    fields?: FieldConfig<TKey>[];
    requiredFields?: TKey[];
    customValidator?: (data: TRecord, rowIndex: number) => ValidationResult[];
    rowIndex: number;
  }
): RowValidation<TRecord> {
  const { fields, customValidator, rowIndex } = options;
  const requiredFields = resolveRequiredKeys(fields, options.requiredFields);
  
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Build the record from mappings
  const data: Record<string, unknown> = {};
  
  // Initialize all fields with null
  if (fields) {
    for (const field of fields) {
      data[field.key] = null;
    }
  } else {
    // Legacy artwork record
    data.title = null;
    data.artist = null;
    data.period = null;
    data.technique = null;
    data.valueAmount = null;
    data.valueCurrency = null;
  }
  
  // Map values from source columns
  for (const mapping of mappings) {
    if (mapping.targetField) {
      const rawValue = row[mapping.sourceColumn];
      const field = fields?.find((f) => f.key === mapping.targetField);
      const value = processValue(rawValue, field);
      // A cell that couldn't be read keeps its text, untransformed, and is flagged below
      const unreadable =
        (field?.type === 'date' && typeof value === 'string') ||
        (field?.type === 'choice' && value !== null && checkChoice(value, field) !== null);
      
      // Apply transform if defined
      data[mapping.targetField] = field?.transform && !unreadable ? field.transform(value) : value;
    }
  }
  
  // Check required fields
  for (const fieldKey of requiredFields) {
    const value = data[fieldKey];
    if (value === null || value === undefined || value === '') {
      const fieldConfig = fields?.find((f) => f.key === fieldKey);
      const legacyField = TARGET_FIELDS.find((f) => f.key === fieldKey);
      errors.push({
        field: fieldKey,
        message: `${fieldConfig?.label || legacyField?.label || fieldKey} is required`,
      });
    }
  }
  
  errors.push(...checkFieldTypes(data, fields));

  // Run field-level validators
  if (fields) {
    for (const field of fields) {
      if (field.validate) {
        const result = field.validate(data[field.key], data);
        if (result) {
          if (result.type === 'error') {
            errors.push({ field: field.key, message: result.message });
          } else {
            warnings.push({ field: field.key, message: result.message });
          }
        }
      }
    }
  } else {
    // Legacy artwork-specific warnings
    const artworkData = data as unknown as ArtworkRecord;
    if (artworkData.valueAmount !== null && artworkData.valueCurrency === null) {
      warnings.push({
        field: 'valueCurrency',
        message: 'Value amount provided without currency',
      });
    }
    if (artworkData.valueCurrency !== null && artworkData.valueAmount === null) {
      warnings.push({
        field: 'valueAmount',
        message: 'Currency provided without value amount',
      });
    }
    if (artworkData.title && /^\d+$/.test(String(artworkData.title))) {
      warnings.push({
        field: 'title',
        message: 'Title appears to be numeric only',
      });
    }
    if (artworkData.artist && /^\d+$/.test(String(artworkData.artist))) {
      warnings.push({
        field: 'artist',
        message: 'Artist appears to be numeric only',
      });
    }
  }
  
  // Run custom row validator
  if (customValidator) {
    const customResults = customValidator(data as TRecord, rowIndex);
    for (const result of customResults) {
      if (result.type === 'error') {
        errors.push({ field: '', message: result.message });
      } else {
        warnings.push({ field: '', message: result.message });
      }
    }
  }
  
  return {
    rowIndex,
    data: data as TRecord,
    originalData: row,
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Errors for values that are not of their field's type. A date field holds a
 * `Date`, nothing, or the text of a cell that could not be read as a date. A
 * choice field holds an option's canonical value, nothing, or the text of a
 * cell that matched no option.
 */
function checkFieldTypes<TKey extends string>(
  data: Record<string, unknown>,
  fields?: FieldConfig<TKey>[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const field of fields ?? []) {
    const value = data[field.key];
    if (value === null || value === undefined || value === '') continue;
    if (field.type === 'date' && !parseCalendarDate(value, field.dateOrder)) {
      errors.push({ field: field.key, message: invalidDateMessage(field.label, field.dateOrder) });
    }
    if (field.type === 'choice') {
      const message = checkChoice(value, field);
      if (message) errors.push({ field: field.key, message });
    }
  }
  return errors;
}

function processValue(
  value: unknown,
  field?: FieldConfig
): unknown {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  const stringValue = String(value).trim();
  
  const type = field?.type || 'string';
  
  switch (type) {
    case 'number':
      return parseNumber(stringValue);
    case 'boolean': {
      const lower = stringValue.toLowerCase();
      if (['true', 'yes', '1', 'on'].includes(lower)) return true;
      if (['false', 'no', '0', 'off'].includes(lower)) return false;
      return null;
    }
    case 'date':
      if (stringValue === '') return null;
      // Unreadable dates keep their text so the cell can be flagged and fixed
      return parseCalendarDate(value instanceof Date ? value : stringValue, field?.dateOrder) ?? stringValue;
    case 'choice':
      // Values that match no option keep their text so the cell can be flagged and fixed
      return coerceChoice(stringValue, field ?? {});
    default:
      return stringValue;
  }
}

/**
 * Get validation summary statistics, in a single pass over the rows
 */
export function getValidationSummary<TRecord>(validations: RowValidation<TRecord>[]): {
  total: number;
  valid: number;
  withErrors: number;
  withWarnings: number;
  excluded: number;
} {
  let valid = 0;
  let withErrors = 0;
  let withWarnings = 0;
  let excluded = 0;
  for (const v of validations) {
    if (v.excluded) excluded++;
    else if (!v.isValid) withErrors++;
    else if (v.warnings.length > 0) withWarnings++;
    else valid++;
  }
  return { total: validations.length, valid, withErrors, withWarnings, excluded };
}
