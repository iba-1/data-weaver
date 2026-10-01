import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { AiEditHandler, FieldConfig, RowRejection, RowValidation, ValidationResult } from '@/lib/import-wizard/types';
import { getValidationSummary } from '@/lib/import-wizard/validator';
import { Skeleton } from '@/components/ui/skeleton';
import { WizardRoot } from './WizardRoot';
import { useReviewRows } from './review/useReviewRows';
import { useVisibleRows } from './review/useVisibleRows';
import { useFindReplace } from './review/useFindReplace';
import { useUndoRedoShortcuts } from './review/useUndoRedoShortcuts';
import { ReviewSummary } from './review/ReviewSummary';
import { ReviewToolbar } from './review/ReviewToolbar';
import { IssueSummary } from './review/IssueSummary';
import { FixGuide } from './review/FixGuide';
import { groupIssues, replacementEdits, type IssueGroup } from '@/lib/import-wizard/issueGroups';
import { ReviewGrid } from './review/ReviewGrid';
import { ReviewActions } from './review/ReviewActions';
import { useMessages } from './messages';
import { hasRelationshipFields, type ResolvedValue } from '@/lib/import-wizard/resolution';

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
  /**
   * Relationship Field values as last resolved (by `relatedValueKey`): their
   * cells show a badge naming the Related Record they resolved to
   */
  relatedValues?: ReadonlyMap<string, ResolvedValue>;
  /**
   * Fix & Retry: the rows are a Commit's Rejected Rows, and this is why the
   * Host App refused each (by rowIndex). Each reason is pinned to its field's
   * cell, or to the whole row without a field; it doesn't block completing,
   * since the Host App decides again. The step's text becomes Fix & Retry's.
   */
  rejections?: ReadonlyMap<number, RowRejection>;
  /**
   * Whether completing goes to Resolution first. By default, whether `fields`
   * has Relationship Fields.
   */
  continuesToResolution?: boolean;
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
  relatedValues,
  rejections,
  continuesToResolution = hasRelationshipFields(fields),
  isLoading = false,
  className,
}: DataValidatorProps<TRecord, TKey>) {
  const m = useMessages();
  const review = useReviewRows<TRecord, TKey>(validatedRows, {
    fields,
    requiredFields,
    validateRow,
    onRowsChange,
    fillPlaceholder: m.review.fillPlaceholder(),
  });
  const { rows } = review;
  const containerRef = useRef<HTMLDivElement>(null);
  useUndoRedoShortcuts(review.undo, review.redo, containerRef);

  const summary = useMemo(() => getValidationSummary(rows), [rows]);
  const [notesAccepted, setNotesAccepted] = useState(false);

  // What blocks the import, grouped by field and cause; warnings apart
  const errorGroups = useMemo(() => groupIssues(rows, 'error'), [rows]);
  const warningGroups = useMemo(() => groupIssues(rows, 'warning'), [rows]);

  // The guided fix: one problem, and the rows it had when the Importer chose it.
  // The grid keeps showing those rows as they get fixed, so none vanishes mid-edit.
  const [active, setActive] = useState<{ group: IssueGroup; scope: ReadonlySet<number> } | null>(null);
  const live = useMemo(() => {
    if (!active) return undefined;
    const current = [...errorGroups, ...warningGroups].find((g) => g.id === active.group.id);
    if (!current) return undefined;
    const inScope = (rowIndex: number) => active.scope.has(rowIndex);
    const rowIndexes = current.rowIndexes.filter(inScope);
    if (rowIndexes.length === 0) return undefined;
    return {
      ...current,
      rowIndexes,
      values: current.values
        .map((v) => ({ ...v, rowIndexes: v.rowIndexes.filter(inScope) }))
        .filter((v) => v.rowIndexes.length > 0),
    };
  }, [active, errorGroups, warningGroups]);

  const view = useVisibleRows(rows, fields, active?.scope);
  const findReplace = useFindReplace(rows, fields, review.applyEdits);

  // Which cell to bring into view (and focus), and which column to scroll to
  const [focusRequest, setFocusRequest] = useState<{ rowIndex: number; field: string; nonce: number } | null>(null);
  const [revealRequest, setRevealRequest] = useState<{ field: string; nonce: number } | null>(null);
  const cursorRef = useRef<number | null>(null);
  const guideHeadingRef = useRef<HTMLHeadingElement>(null);
  const [focusGuide, setFocusGuide] = useState(0);
  useEffect(() => {
    if (focusGuide) guideHeadingRef.current?.focus();
  }, [focusGuide]);

  const startFix = useCallback(
    (group: IssueGroup) => {
      setActive({ group, scope: new Set(group.rowIndexes) });
      view.setFilter('all');
      view.setSearchQuery('');
      cursorRef.current = null;
      setRevealRequest({ field: group.field, nonce: Date.now() });
      setFocusGuide((n) => n + 1);
    },
    [view]
  );

  const goTo = useCallback(
    (rowIndex: number) => {
      if (!active) return;
      cursorRef.current = rowIndex;
      setFocusRequest({ rowIndex, field: active.group.field, nonce: Date.now() });
    },
    [active]
  );

  const nextCell = useCallback(() => {
    const remaining = live?.rowIndexes ?? [];
    if (remaining.length === 0) return;
    const cursor = cursorRef.current;
    goTo(remaining.find((r) => cursor === null || r > cursor) ?? remaining[0]);
  }, [live, goTo]);

  const replace = useCallback(
    (text: string, replacement: string) => {
      if (!active) return;
      const edits = replacementEdits(rows, active.group, text, replacement).filter((e) => active.scope.has(e.rowIndex));
      review.applyEdits(edits);
      // The control the Importer used may be gone: keep focus in the guide
      setFocusGuide((n) => n + 1);
    },
    [active, rows, review]
  );

  const otherGroups = [...errorGroups, ...warningGroups].filter((g) => g.id !== active?.group.id);
  const nextProblem = otherGroups[0];

  if (isLoading) {
    return <ReviewSkeleton className={className} />;
  }

  return (
    <div ref={containerRef} className={cn('flex min-h-0 flex-1 flex-col gap-4', className)}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{rejections ? m.fix.title() : m.review.title()}</h3>
            <p className="text-sm text-muted-foreground">{rejections ? m.fix.description() : m.review.description()}</p>
          </div>
          <ReviewSummary summary={summary} filter={view.filter} onFilterChange={view.setFilter} />
        </div>

        <IssueSummary
          errorGroups={errorGroups}
          warningGroups={warningGroups}
          blockedRows={summary.withErrors}
          fields={fields}
          activeGroupId={active?.group.id}
          compact={!!active}
          onFix={startFix}
          notesAccepted={notesAccepted}
          onNotesAcceptedChange={setNotesAccepted}
        />

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

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {active && (
          <FixGuide
            ref={guideHeadingRef}
            group={active.group}
            live={live}
            field={(fields.find((f) => f.key === active.group.field) ?? { key: active.group.field, label: active.group.field, type: 'string' }) as FieldConfig<string>}
            onReplace={replace}
            onGoTo={goTo}
            onNextCell={nextCell}
            onShowAll={() => setActive(null)}
            onNextProblem={nextProblem ? () => startFix(nextProblem) : undefined}
            onUndo={review.undo}
            canUndo={review.canUndo}
            onExclude={() => live && review.excludeRows(new Set(live.rowIndexes))}
          />
        )}
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {view.visibleRows.length === view.totalRows
            ? m.review.rowCount({ count: view.totalRows })
            : m.review.rowCountFiltered({ visible: view.visibleRows.length, total: view.totalRows })}
        </p>
        <ReviewGrid
          rows={view.visibleRows}
          fields={fields}
          requiredKeys={review.requiredKeys}
          searchQuery={view.searchQuery}
          scrollResetKey={`${view.filter}\u0000${view.searchQuery}`}
          onCellEdit={review.editCell}
          onToggleExcluded={review.toggleExcluded}
          relatedValues={relatedValues}
          rejections={rejections}
          notesAccepted={notesAccepted}
          activeField={active?.group.field}
          revealRequest={revealRequest}
          focusRequest={focusRequest}
        />
      </div>

      <ReviewActions
        summary={summary}
        onBack={onBack}
        onComplete={onComplete}
        continuesToResolution={continuesToResolution}
        retrying={!!rejections}
      />
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
