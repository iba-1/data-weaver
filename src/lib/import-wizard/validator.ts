import type {
  ArtworkRecord,
  ColumnMapping,
  RowValidation,
  TargetField,
  ValidationError,
  ValidationWarning,
} from './types';

export function validateRows(
  rows: Record<string, unknown>[],
  mappings: ColumnMapping[],
  requiredFields: TargetField[] = ['title', 'artist']
): RowValidation[] {
  return rows.map((row, index) => validateRow(row, mappings, requiredFields, index));
}

function validateRow(
  row: Record<string, unknown>,
  mappings: ColumnMapping[],
  requiredFields: TargetField[],
  rowIndex: number
): RowValidation {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Build the artwork record from mappings
  const data: ArtworkRecord = {
    title: null,
    artist: null,
    period: null,
    technique: null,
    valueAmount: null,
    valueCurrency: null,
  };
  
  for (const mapping of mappings) {
    if (mapping.targetField) {
      const rawValue = row[mapping.sourceColumn];
      const value = processValue(rawValue, mapping.targetField);
      
      if (mapping.targetField === 'valueAmount') {
        data.valueAmount = value as number | null;
      } else {
        data[mapping.targetField] = value as string | null;
      }
    }
  }
  
  // Check required fields
  for (const field of requiredFields) {
    const value = data[field];
    if (value === null || value === undefined || value === '') {
      errors.push({
        field,
        message: `${getFieldLabel(field)} is required`,
      });
    }
  }
  
  // Check for potential issues (warnings)
  if (data.valueAmount !== null && data.valueCurrency === null) {
    warnings.push({
      field: 'valueCurrency',
      message: 'Value amount provided without currency',
    });
  }
  
  if (data.valueCurrency !== null && data.valueAmount === null) {
    warnings.push({
      field: 'valueAmount',
      message: 'Currency provided without value amount',
    });
  }
  
  // Check for suspicious numeric values in text fields
  if (data.title && /^\d+$/.test(data.title.toString())) {
    warnings.push({
      field: 'title',
      message: 'Title appears to be numeric only',
    });
  }
  
  if (data.artist && /^\d+$/.test(data.artist.toString())) {
    warnings.push({
      field: 'artist',
      message: 'Artist appears to be numeric only',
    });
  }
  
  return {
    rowIndex,
    data,
    originalData: row,
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function processValue(
  value: unknown,
  targetField: TargetField
): string | number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  const stringValue = String(value).trim();
  
  if (targetField === 'valueAmount') {
    // Parse as number, removing common formatting
    const cleaned = stringValue.replace(/[,$€£¥\s]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }
  
  return stringValue;
}

function getFieldLabel(field: TargetField): string {
  const labels: Record<TargetField, string> = {
    title: 'Title',
    artist: 'Artist',
    period: 'Period',
    technique: 'Technique',
    valueAmount: 'Value Amount',
    valueCurrency: 'Value Currency',
  };
  return labels[field];
}

export function getValidationSummary(validations: RowValidation[]): {
  total: number;
  valid: number;
  withErrors: number;
  withWarnings: number;
} {
  return {
    total: validations.length,
    valid: validations.filter((v) => v.isValid && v.warnings.length === 0).length,
    withErrors: validations.filter((v) => !v.isValid).length,
    withWarnings: validations.filter((v) => v.isValid && v.warnings.length > 0).length,
  };
}
