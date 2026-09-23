import { cn } from '@/lib/utils';
import type { AiEditHandler, FieldConfig, RowValidation, ValidationResult } from '@/lib/import-wizard/types';
import { getValidationSummary } from '@/lib/import-wizard/validator';
import { Skeleton } from '@/components/ui/skeleton';
import { WizardRoot } from './WizardRoot';
import { useReviewRows } from './review/useReviewRows';
import { useVisibleRows } from './review/useVisibleRows';
import { useFindReplace } from './review/useFindReplace';
import { useUndoRedoShortcuts } from './review/useUndoRedoShortcuts';
import { ReviewSummary } from './review/ReviewSummary';
import { ReviewToolbar } from './review/ReviewToolbar';
import { ReviewGrid } from './review/ReviewGrid';
import { ReviewPagination } from './review/ReviewPagination';
import { ReviewActions } from './review/ReviewActions';

interface DataValidatorProps<TRecord = Record<string, unknown>, TKey extends string = string> {
  validatedRows: RowValidation<TRecord>[];
  fields: FieldConfig<TKey>[];
  /** Extra required field keys, on top of fields marked `required: true` */
  requiredFields?: TKey[];
  /** Host App row validator, re-applied after every edit */
  validateRow?: (data: TRecord, rowIndex: number) => ValidationResult[];
  /** Host App AI endpoint; AI Edit is hidden without it */
  aiEdit?: AiEditHandler;
  onComplete: () => void;
  onBack: () => void;
  onRowsChange?: (rows: RowValidation<TRecord>[]) => void;
  isLoading?: boolean;
  className?: string;
}

/** Review step: edit, search, exclude and fix rows before completing the import */
export function DataValidator<TRecord = Record<string, unknown>, TKey extends string = string>(
  props: DataValidatorProps<TRecord, TKey>
) {
  return (
    <WizardRoot>
      <DataValidatorContent {...props} />
    </WizardRoot>
  );
}

function DataValidatorContent<TRecord = Record<string, unknown>, TKey extends string = string>({
  validatedRows,
  fields,
  requiredFields,
  validateRow,
  aiEdit,
  onComplete,
  onBack,
  onRowsChange,
  isLoading = false,
  className,
}: DataValidatorProps<TRecord, TKey>) {
  const review = useReviewRows<TRecord, TKey>(validatedRows, {
    fields,
    requiredFields,
    validateRow,
    onRowsChange,
  });
  const { rows } = review;
  useUndoRedoShortcuts(review.undo, review.redo);

  const view = useVisibleRows(rows, fields);
  const findReplace = useFindReplace(rows, fields, review.applyEdits);
  const summary = getValidationSummary(rows);

  if (isLoading) {
    return <ReviewSkeleton className={className} />;
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Validate Data</h3>
            <p className="text-sm text-muted-foreground">
              Review, search, and fix data before importing
            </p>
          </div>
          <ReviewSummary summary={summary} filter={view.filter} onFilterChange={view.setFilter} />
        </div>

        <ReviewToolbar
          rows={rows}
          fields={fields}
          searchQuery={view.searchQuery}
          onSearchChange={view.setSearchQuery}
          searchMatchCount={view.searchMatchCount}
          onReplace={findReplace.replaceAll}
          countReplaceMatches={findReplace.countMatches}
          aiEdit={aiEdit}
          onApplyEdits={review.applyEdits}
          hasErrors={summary.withErrors > 0}
          onExcludeInvalid={review.excludeInvalid}
          onFillEmptyRequired={review.fillEmptyRequired}
          onUndo={review.undo}
          onRedo={review.redo}
          canUndo={review.canUndo}
          canRedo={review.canRedo}
        />
      </div>

      <ReviewGrid
        rows={view.pageRows}
        fields={fields}
        requiredKeys={review.requiredKeys}
        searchQuery={view.searchQuery}
        onCellEdit={review.editCell}
        onToggleExcluded={review.toggleExcluded}
      />

      <ReviewPagination {...view.pagination} />

      <ReviewActions summary={summary} onBack={onBack} onComplete={onComplete} />
    </div>
  );
}

function ReviewSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
