import React, { useCallback, useState } from 'react';
import { FileUploader } from './FileUploader';
import { ColumnMapper } from './ColumnMapper';
import { DataValidator } from './DataValidator';
import { parseFile } from '@/lib/import-wizard/parser';
import { autoMatchColumns, updateMapping } from '@/lib/import-wizard/matcher';
import { validateRows } from '@/lib/import-wizard/validator';
import type {
  ArtworkRecord,
  ColumnMapping,
  FieldConfig,
  ImportWizardEvent,
  ImportWizardProps,
  ImportWizardState,
  ParsedFileData,
  RowValidation,
  TargetField,
  WizardStep,
} from '@/lib/import-wizard/types';
import { ARTWORK_FIELD_CONFIGS, TARGET_FIELDS } from '@/lib/import-wizard/types';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

const INITIAL_STATE: ImportWizardState = {
  step: 'upload',
  file: null,
  parsedData: null,
  columnMappings: [],
  validatedRows: [],
  isLoading: false,
  error: null,
};

export function ImportWizard<TRecord = ArtworkRecord, TKey extends string = TargetField>({
  fields,
  requiredFields,
  onComplete,
  onEvent,
  onRowParse,
  onRowComplete,
  validateRow: customValidator,
  title = 'Import Data',
  description,
  acceptedFileTypes = ['.csv', '.xlsx', '.xls'],
  maxFileSize = 10485760,
  className,
}: ImportWizardProps<TRecord, TKey>) {
  const [state, setState] = useState<ImportWizardState<TRecord>>(INITIAL_STATE as ImportWizardState<TRecord>);

  // Use provided fields or default to artwork fields
  const fieldConfigs = (fields || ARTWORK_FIELD_CONFIGS) as FieldConfig<TKey>[];
  const requiredFieldKeys = requiredFields || (['title', 'artist'] as TKey[]);

  const emit = useCallback(
    (event: ImportWizardEvent<TRecord>) => {
      onEvent?.(event);
    },
    [onEvent]
  );

  const handleFileSelected = useCallback(
    async (file: File) => {
      setState((s) => ({ ...s, file, isLoading: true, error: null }));

      try {
        const parsedData = await parseFile(file);

        if (parsedData.fileType === 'pdf') {
          setState((s) => ({
            ...s,
            isLoading: false,
            error: 'PDF parsing with AI is not yet implemented. Please use CSV or Excel.',
          }));
          return;
        }

        if (parsedData.rows.length === 0) {
          setState((s) => ({
            ...s,
            isLoading: false,
            error: 'The file appears to be empty or has no data rows.',
          }));
          return;
        }

        const columnMappings = autoMatchColumns<TKey>(parsedData.headers, fieldConfigs);

        setState((s) => ({
          ...s,
          parsedData,
          columnMappings,
          step: 'mapping',
          isLoading: false,
        }));

        emit({ type: 'FILE_PARSED', data: parsedData });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to parse file';
        setState((s) => ({ ...s, isLoading: false, error: message }));
        emit({ type: 'ERROR', error: message });
      }
    },
    [emit, fieldConfigs]
  );

  const handleMappingChange = useCallback(
    (sourceColumn: string, targetField: TKey | null) => {
      setState((s) => ({
        ...s,
        columnMappings: updateMapping(s.columnMappings, sourceColumn, targetField),
      }));
    },
    []
  );

  const handleConfirmMapping = useCallback(() => {
    const { parsedData, columnMappings } = state;
    if (!parsedData) return;

    setState((s) => ({ ...s, isLoading: true }));

    // Validate rows with the current mappings
    const validatedRows = validateRows<TRecord, TKey>(
      parsedData.rows,
      columnMappings as ColumnMapping<TKey>[],
      {
        fields: fieldConfigs,
        requiredFields: requiredFieldKeys,
        customValidator,
        onRowParse: onRowParse
          ? (rowIndex, rawData, parsedData) => {
              const event = { rowIndex, rawData, parsedData };
              emit({ type: 'ROW_PARSED', event });
              return onRowParse(event);
            }
          : undefined,
      }
    );

    // Emit row complete events
    if (onRowComplete) {
      for (const row of validatedRows) {
        const event = {
          rowIndex: row.rowIndex,
          data: row.data,
          isValid: row.isValid,
          errors: row.errors,
          warnings: row.warnings,
        };
        emit({ type: 'ROW_COMPLETE', event });
        onRowComplete(event);
      }
    }

    setState((s) => ({
      ...s,
      validatedRows,
      step: 'validation',
      isLoading: false,
    }));

    emit({ type: 'COLUMNS_MAPPED', mappings: columnMappings });
    emit({ type: 'DATA_VALIDATED', rows: validatedRows });
  }, [state, fieldConfigs, requiredFieldKeys, customValidator, onRowParse, onRowComplete, emit]);

  const handleBack = useCallback(() => {
    setState((s) => ({ ...s, step: 'mapping' }));
  }, []);

  const handleRowsChange = useCallback(
    (updatedRows: RowValidation<TRecord>[]) => {
      setState((s) => ({ ...s, validatedRows: updatedRows }));

      // Emit row complete events for changed rows
      if (onRowComplete) {
        for (const row of updatedRows) {
          const event = {
            rowIndex: row.rowIndex,
            data: row.data,
            isValid: row.isValid,
            errors: row.errors,
            warnings: row.warnings,
          };
          emit({ type: 'ROW_COMPLETE', event });
          onRowComplete(event);
        }
      }
    },
    [onRowComplete, emit]
  );

  const handleComplete = useCallback(() => {
    const validRows = state.validatedRows.filter((r) => r.isValid).map((r) => r.data);

    emit({ type: 'IMPORT_COMPLETED', data: validRows });
    onComplete?.(validRows);
  }, [state.validatedRows, emit, onComplete]);

  return (
    <div className={cn('w-full max-w-4xl mx-auto', className)}>
      {/* Step indicator */}
      <StepIndicator currentStep={state.step} />

      {/* Content */}
      <div className="mt-8">
        {state.step === 'upload' && (
          <FileUploader
            onFileSelected={handleFileSelected}
            isLoading={state.isLoading}
            error={state.error}
          />
        )}

        {state.step === 'mapping' && (
          <ColumnMapper
            mappings={state.columnMappings}
            fields={fieldConfigs}
            onMappingChange={handleMappingChange}
            onConfirm={handleConfirmMapping}
            isLoading={state.isLoading}
          />
        )}

        {state.step === 'validation' && (
          <DataValidator
            validatedRows={state.validatedRows}
            fields={fieldConfigs}
            requiredFields={requiredFieldKeys}
            onComplete={handleComplete}
            onBack={handleBack}
            onRowsChange={handleRowsChange}
            isLoading={state.isLoading}
          />
        )}
      </div>
    </div>
  );
}

interface StepIndicatorProps {
  currentStep: WizardStep;
}

function StepIndicator({ currentStep }: StepIndicatorProps) {
  const steps: Array<{ key: WizardStep; label: string; number: number }> = [
    { key: 'upload', label: 'Upload', number: 1 },
    { key: 'mapping', label: 'Match columns', number: 2 },
    { key: 'validation', label: 'Review and edit', number: 3 },
  ];

  const currentIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-6">
      {steps.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isActive = isComplete || isCurrent;

        return (
          <React.Fragment key={step.key}>
            {index > 0 && (
              <div
                className={cn(
                  'h-px w-8 transition-colors',
                  isActive ? 'bg-[hsl(var(--step-active))]' : 'bg-border'
                )}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-all',
                  isActive
                    ? 'bg-[hsl(var(--step-active))] text-white'
                    : 'bg-muted text-[hsl(var(--step-inactive))]'
                )}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : step.number}
              </div>
              <span
                className={cn(
                  'text-sm font-medium transition-colors',
                  isActive
                    ? 'text-[hsl(var(--step-active))]'
                    : 'text-[hsl(var(--step-inactive))]'
                )}
              >
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
