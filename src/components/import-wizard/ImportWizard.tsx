import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FileUploader } from './FileUploader';
import { ColumnMapper } from './ColumnMapper';
import { DataValidator } from './DataValidator';
import { WizardRoot } from './WizardRoot';
import { DEFAULT_ACCEPTED_FILE_TYPES, DEFAULT_MAX_FILE_SIZE, parseFile } from '@/lib/import-wizard/parser';
import { autoMatchColumns, updateMapping } from '@/lib/import-wizard/matcher';
import { markRequiredFields, validateRows } from '@/lib/import-wizard/validator';
import { hasOptionLoaders, loadChoiceOptions, OptionsLoadError } from '@/lib/import-wizard/choices';
import { resolveMessages } from '@/lib/import-wizard/messages';
import { cellText } from '@/lib/import-wizard/values';
import { commitRows, createImportKeys, importReport, normaliseBatchSize, toBatches } from '@/lib/import-wizard/commit';
import { ChoiceOptionsError, ChoiceOptionsLoading } from './review/ChoiceOptionsStatus';
import { CommitProgress } from './commit/CommitProgress';
import { ImportReportView } from './commit/ImportReportView';
import { RejectedRowsDownload } from './commit/RejectedRowsDownload';
import { ResolutionStep } from './resolution/ResolutionStep';
import { useResolution } from './resolution/useResolution';
import {
  combineDecisions,
  createdRelatedIds,
  createRelatedRecords,
  linkAlreadyCreated,
  planRelatedCreations,
  rememberCommitted,
  retryDecisions,
  substituteRelatedIds,
  undecidedValuesOnly,
} from '@/lib/import-wizard/related';
import { collectRelatedValues, type ResolvedValue } from '@/lib/import-wizard/resolution';
import { Button } from '@/components/ui/button';
import { MessagesContext, useMessages } from './messages';
import type {
  ArtworkRecord,
  ColumnMapping,
  FieldConfig,
  ImportWizardEvent,
  ImportWizardProps,
  ImportWizardState,
  ImportReport,
  ImportRow,
  ParsedFileData,
  RejectedRow,
  RelatedRecordId,
  RowCompleteEvent,
  RowRejection,
  RowValidation,
  TargetField,
  WizardStep,
} from '@/lib/import-wizard/types';
import { ARTWORK_FIELD_CONFIGS } from '@/lib/import-wizard/types';
import { cn } from '@/lib/utils';
import { Check, Wrench } from 'lucide-react';

/**
 * The review step before its rows can be shown: choice options loading, failed
 * to load, or loaded, with the fields the rows were validated against.
 */
type ReviewState<TKey extends string> =
  | { status: 'loading' }
  /** `field` is the label of the field whose options failed, `reason` the loader's error */
  | { status: 'error'; field: string; reason: string }
  | { status: 'ready'; fields: FieldConfig<TKey>[] };

const INITIAL_STATE: ImportWizardState = {
  step: 'upload',
  file: null,
  parsedData: null,
  columnMappings: [],
  validatedRows: [],
  isLoading: false,
  error: null,
};

/**
 * Call one of the Host App's callbacks. A callback that throws is the Host
 * App's bug: it is logged, and the import carries on rather than leaving the
 * Importer stuck (e.g. on the Commit progress screen).
 */
function callHost(name: string, callback: () => void): void {
  try {
    callback();
  } catch (error) {
    console.error(`[data-weaver] The Host App's ${name} threw; the import carries on.`, error);
  }
}

export function ImportWizard<TRecord = ArtworkRecord, TKey extends string = TargetField>({
  fields,
  requiredFields,
  adapter,
  batchSize,
  retry,
  onImportFinished,
  onLeaveWarningChange,
  onEvent,
  onRowParse,
  onRowComplete,
  validateRow: customValidator,
  aiEdit,
  title,
  description,
  acceptedFileTypes = DEFAULT_ACCEPTED_FILE_TYPES,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  messages,
  className,
}: ImportWizardProps<TRecord, TKey>) {
  // The same catalogue WizardRoot provides below, for text built here (errors and ERROR events)
  const enclosingMessages = useContext(MessagesContext);
  const m = useMemo(() => resolveMessages(messages, enclosingMessages), [messages, enclosingMessages]);
  const [state, setState] = useState<ImportWizardState<TRecord>>(INITIAL_STATE as ImportWizardState<TRecord>);
  const [review, setReview] = useState<ReviewState<TKey>>({ status: 'loading' });
  // One Import Key per data row of the file, by rowIndex: made when the file is
  // parsed and tied to the source row, so edits, undo/redo, exclusion and
  // going back to column matching (which re-validates the file's rows) keep it
  const [importKeys, setImportKeys] = useState<string[]>([]);
  // `retry` is set while a batch that failed in transit is being sent again
  const [commitProgress, setCommitProgress] = useState<{
    done: number;
    total: number;
    retry: { attempt: number; attempts: number } | null;
  }>({ done: 0, total: 0, retry: null });
  const [report, setReport] = useState<ImportReport<TRecord> | null>(null);
  const committingRef = useRef(false);
  // Aborted on unmount: no more batches are sent once nobody can see the Import Report
  const commitAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => commitAbortRef.current?.abort(), []);

  // Use provided fields or default to artwork fields. `requiredFields` is
  // folded into the fields so every step reads one source of truth.
  const fieldConfigs = useMemo(
    () => markRequiredFields((fields || ARTWORK_FIELD_CONFIGS) as FieldConfig<TKey>[], requiredFields),
    [fields, requiredFields]
  );

  // Fix & Retry: the Rejected Rows of the last Commit, by rowIndex, with why
  // each was refused. Imported rows are not among them: they are never shown
  // or sent again, and neither are the rows excluded before.
  const rejections = useMemo(
    () => new Map<number, RowRejection>((report?.rejected ?? []).map((row) => [row.rowIndex, { reason: row.reason, field: row.field }])),
    [report]
  );
  const fixRows = useMemo(
    () => state.validatedRows.filter((row) => rejections.has(row.rowIndex)),
    [state.validatedRows, rejections]
  );

  // Each Relationship Field value a Commit was made with, by relatedValueKey,
  // with its decision and its rows' own (Homonyms). A new record once created
  // is linked to from then on, so Fix & Retry never creates a Related Record twice.
  const [committedValues, setCommittedValues] = useState<ReadonlyMap<string, ResolvedValue>>(() => new Map());
  // The Related Records created so far, by creationKey
  const createdIdsRef = useRef(new Map<string, RelatedRecordId>());

  // What Resolution works on: the file's rows before the first Commit; in Fix
  // & Retry, the Rejected Rows with only the values that have no committed
  // decision for their row (new or changed in Fix & Retry), so earlier
  // decisions are kept, not asked again
  const resolutionRows = useMemo(
    () => (report ? undecidedValuesOnly(fixRows, fieldConfigs, committedValues) : state.validatedRows),
    [report, fixRows, fieldConfigs, committedValues, state.validatedRows]
  );
  const fixNeedsResolution = useMemo(
    () => report !== null && collectRelatedValues(resolutionRows, fieldConfigs).length > 0,
    [report, resolutionRows, fieldConfigs]
  );

  // In Fix & Retry, a value new or changed since may be merged with one committed earlier (never the reverse)
  const committedList = useMemo(() => [...committedValues.values()], [committedValues]);

  // With Relationship Fields, Resolution sits between review and Commit
  const resolution = useResolution<TRecord, TKey>({
    fields: fieldConfigs,
    rows: resolutionRows,
    adapter,
    messages: m,
    active: state.step === 'resolution',
    committed: committedList,
  });
  const withResolution = resolution.kinds.length > 0;
  const { start: startLookup, leave: leaveResolution } = resolution;

  // In Resolution's per-row choices, a row is shown with its first field (e.g. its title), as in the Import Report
  const rowsByIndex = useMemo(() => new Map(state.validatedRows.map((r) => [r.rowIndex, r])), [state.validatedRows]);
  const describeRow = useCallback(
    (rowIndex: number) => {
      const identifying = fieldConfigs[0];
      const row = rowsByIndex.get(rowIndex);
      return identifying && row ? cellText((row.data as Record<string, unknown>)[identifying.key]) : '';
    },
    [fieldConfigs, rowsByIndex]
  );

  const emit = useCallback(
    (event: ImportWizardEvent<TRecord>) => {
      callHost('onEvent', () => onEvent?.(event));
    },
    [onEvent]
  );

  // Latest callback, so a Host App passing inline functions doesn't retrigger work
  const onRowCompleteRef = useRef(onRowComplete);
  const onImportFinishedRef = useRef(onImportFinished);
  const onLeaveWarningChangeRef = useRef(onLeaveWarningChange);
  useEffect(() => {
    onRowCompleteRef.current = onRowComplete;
    onImportFinishedRef.current = onImportFinished;
    onLeaveWarningChangeRef.current = onLeaveWarningChange;
  });

  // The Import Report is not kept: while it has Rejected Rows (in the report,
  // Fix & Retry, or while they are sent again), leaving asks to confirm. The
  // wizard guards closing or reloading the tab; the Host App is told so it can
  // guard its own router's navigation.
  const warnOnLeave = (report?.rejected.length ?? 0) > 0;
  useEffect(() => {
    if (!warnOnLeave) return;
    const confirmLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // For browsers that predate preventDefault() here (e.g. Chrome before 119)
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', confirmLeaving);
    callHost('onLeaveWarningChange', () => onLeaveWarningChangeRef.current?.(true));
    return () => {
      window.removeEventListener('beforeunload', confirmLeaving);
      callHost('onLeaveWarningChange', () => onLeaveWarningChangeRef.current?.(false));
    };
  }, [warnOnLeave]);

  const reportRowComplete = useCallback(
    (row: RowValidation<TRecord>) => {
      const event: RowCompleteEvent<TRecord> = {
        rowIndex: row.rowIndex,
        data: row.data,
        isValid: row.isValid,
        errors: row.errors,
        warnings: row.warnings,
      };
      emit({ type: 'ROW_COMPLETE', event });
      callHost('onRowComplete', () => onRowCompleteRef.current?.(event));
    },
    [emit]
  );

  // Rows as last reported, to tell which rows an update actually changed
  const reportedRowsRef = useRef<RowValidation<TRecord>[]>([]);
  // Each row's record as the review opened, by rowIndex, before any edit: the
  // download of the Rejected Rows writes a field back only if it was edited
  const [uneditedRecords, setUneditedRecords] = useState<TRecord[]>([]);

  const handleFileSelected = useCallback(
    async (file: File) => {
      setState((s) => ({ ...s, file, isLoading: true, error: null }));

      try {
        const parsedData = await parseFile(file);

        if (parsedData.rows.length === 0) {
          setState((s) => ({
            ...s,
            isLoading: false,
            error: m.upload.empty({ fileName: file.name }),
          }));
          return;
        }

        const columnMappings = autoMatchColumns<TKey>(parsedData.headers, fieldConfigs);

        setImportKeys(createImportKeys(parsedData.rows.length));
        setState((s) => ({
          ...s,
          parsedData,
          columnMappings,
          step: 'mapping',
          isLoading: false,
        }));

        emit({ type: 'FILE_PARSED', data: parsedData });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const message = m.upload.unreadable({ fileName: file.name, reason });
        setState((s) => ({ ...s, isLoading: false, error: message }));
        emit({ type: 'ERROR', error: message });
      }
    },
    [emit, fieldConfigs, m]
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

  /** Validate the rows with fields whose choice options are loaded, and open the review */
  const showReview = useCallback(
    (fields: FieldConfig<TKey>[], parsedData: ParsedFileData, columnMappings: ColumnMapping[]) => {
      const validatedRows = validateRows<TRecord, TKey>(
        parsedData.rows,
        columnMappings as ColumnMapping<TKey>[],
        {
          fields,
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

      reportedRowsRef.current = validatedRows;
      setUneditedRecords(validatedRows.map((row) => row.data));
      validatedRows.forEach(reportRowComplete);

      setReview({ status: 'ready', fields });
      setState((s) => ({
        ...s,
        validatedRows,
        step: 'validation',
        isLoading: false,
      }));

      emit({ type: 'COLUMNS_MAPPED', mappings: columnMappings });
      emit({ type: 'DATA_VALIDATED', rows: validatedRows });
    },
    [customValidator, onRowParse, reportRowComplete, emit]
  );

  // Bumped whenever the review starts or is left, so late options are ignored
  const reviewRequestRef = useRef(0);

  // Choice options load once each time the review starts, then rows are validated against them
  const startReview = useCallback(async () => {
    const { parsedData, columnMappings } = state;
    if (!parsedData) return;
    const request = ++reviewRequestRef.current;

    if (!hasOptionLoaders(fieldConfigs)) {
      showReview(fieldConfigs, parsedData, columnMappings);
      return;
    }

    setReview({ status: 'loading' });
    setState((s) => ({ ...s, step: 'validation' }));
    try {
      const fields = await loadChoiceOptions(fieldConfigs);
      if (request === reviewRequestRef.current) showReview(fields, parsedData, columnMappings);
    } catch (error) {
      if (request !== reviewRequestRef.current) return;
      const failure =
        error instanceof OptionsLoadError
          ? { field: error.field, reason: error.reason }
          : { field: loaderFieldLabels(fieldConfigs).join(', '), reason: error instanceof Error ? error.message : String(error) };
      setReview({ status: 'error', ...failure });
      emit({ type: 'ERROR', error: m.options.loadFailed(failure) });
    }
  }, [state, fieldConfigs, showReview, emit, m]);

  const handleBack = useCallback(() => {
    reviewRequestRef.current++;
    setState((s) => ({ ...s, step: 'mapping' }));
  }, []);

  /**
   * Rows changed in the grid: every row in the review, only the Rejected Rows
   * in Fix & Retry. They replace the file's rows with the same rowIndex.
   */
  const handleRowsChange = useCallback(
    (updatedRows: RowValidation<TRecord>[]) => {
      const previous = new Map(reportedRowsRef.current.map((row) => [row.rowIndex, row]));
      const updated = new Map(updatedRows.map((row) => [row.rowIndex, row]));
      const next = reportedRowsRef.current.map((row) => updated.get(row.rowIndex) ?? row);
      reportedRowsRef.current = next;
      setState((s) => ({ ...s, validatedRows: next }));

      // Edits replace a row object; untouched rows keep their identity
      for (const row of updatedRows) {
        if (previous.get(row.rowIndex) !== row) reportRowComplete(row);
      }
    },
    [reportRowComplete]
  );

  /** Open Resolution and look up the values not looked up yet */
  const startResolution = useCallback(async () => {
    setState((s) => ({ ...s, step: 'resolution' }));
    const failure = await startLookup();
    if (failure) emit({ type: 'ERROR', error: failure });
  }, [startLookup, emit]);

  /** Back from Resolution to the review (or Fix & Retry); the grid then shows what each value resolved to */
  const handleBackToReview = useCallback(() => {
    leaveResolution();
    setState((s) => ({ ...s, step: report ? 'fix' : 'validation' }));
  }, [leaveResolution, report]);

  const handleOpenFix = useCallback(() => setState((s) => ({ ...s, step: 'fix' })), []);
  const handleBackToReport = useCallback(() => setState((s) => ({ ...s, step: 'report' })), []);

  /**
   * Commit `rows`: create the new Related Records `resolved` decides (if
   * any), save every included row through the Host App's adapter, then show
   * the Import Report. After Fix & Retry, `previous` is the report the retry
   * started from, and the new report covers every outcome so far.
   */
  const commit = useCallback(
    async (rows: RowValidation<TRecord>[], resolved: ResolvedValue[], previous: ImportReport<TRecord> | null) => {
      committingRef.current = true;

      // Each row keeps the Import Key it got when the file was parsed, on every Commit (ADR-0002)
      const toImportRow = (row: RowValidation<TRecord>): ImportRow<TRecord> => ({
        importKey: importKeys[row.rowIndex],
        rowIndex: row.rowIndex,
        record: row.data,
      });
      const included = rows.filter((r) => !r.excluded).map(toImportRow);
      const excluded = rows.filter((r) => r.excluded).map(toImportRow);

      setCommitProgress({ done: 0, total: included.length, retry: null });
      setState((s) => ({ ...s, step: 'commit' }));

      const abort = new AbortController();
      commitAbortRef.current = abort;

      // First the new Related Records, once each and one at a time, then IDs in place of names (ADR-0001)
      let toSave = included;
      let notCreated: RejectedRow<TRecord>[] = [];
      if (withResolution) {
        const created = await createRelatedRecords(planRelatedCreations(resolved), {
          // Called on the adapter, so a Host App's class instance keeps its `this`
          createRelated: (kind, name) => adapter.createRelated!(kind, name),
          messages: m,
          signal: abort.signal,
        });
        if (abort.signal.aborted) return;
        ({ ready: toSave, rejected: notCreated } = substituteRelatedIds(included, fieldConfigs, resolved, created, m));
        setCommitProgress({ done: notCreated.length, total: included.length, retry: null });

        // Kept for Fix & Retry: what each value and row was committed with, linking to the records now created
        for (const [key, id] of createdRelatedIds(created)) createdIdsRef.current.set(key, id);
        const committed = linkAlreadyCreated(resolved, createdIdsRef.current);
        setCommittedValues((before) => rememberCommitted(before, committed));
      }

      emit({
        type: 'COMMIT_STARTED',
        rows: toSave.length,
        batches: toBatches(toSave, normaliseBatchSize(batchSize)).length,
        excluded: excluded.length,
      });

      const outcome = await commitRows(toSave, {
        signal: abort.signal,
        // Called on the adapter, so a Host App's class instance keeps its `this`
        saveBatch: (batch) => adapter.saveBatch(batch),
        batchSize,
        retry,
        messages: m,
        onBatchRetry: (batchRetry) => {
          setCommitProgress((p) => ({ ...p, retry: { attempt: batchRetry.attempt, attempts: batchRetry.attempts } }));
          emit({ type: 'BATCH_RETRY', retry: batchRetry });
        },
        onBatchSettled: (result, progress) => {
          for (const problem of result.problems) console.error(`[data-weaver] ${problem}`);
          setCommitProgress({ done: notCreated.length + progress.done, total: included.length, retry: null });
          emit({ type: 'BATCH_SETTLED', progress, created: result.created, rejected: result.rejected });
        },
      });

      if (abort.signal.aborted) return;
      // Rejected whether the Host App refused them or their Related Record was not created
      const finished = importReport(
        { created: outcome.created, rejected: [...notCreated, ...outcome.rejected], excluded },
        previous
      );
      committingRef.current = false;
      setReport(finished);
      setState((s) => ({ ...s, step: 'report' }));
      emit({ type: 'IMPORT_FINISHED', report: finished });
      callHost('onImportFinished', () => onImportFinishedRef.current?.(finished));
    },
    [importKeys, withResolution, adapter, fieldConfigs, batchSize, retry, m, emit]
  );

  /** The first Commit: every row of the file, as reviewed (and resolved) */
  const handleCommit = useCallback(async () => {
    // Rows are only checked against choice options once the options have loaded
    if (review.status !== 'ready' || committingRef.current || report) return;
    const rows = state.validatedRows;
    // Never drop a row silently: every row is either valid or excluded
    if (rows.some((r) => !r.excluded && !r.isValid)) return;
    // Every Relationship Field value must be looked up, decided and named
    if (withResolution && !resolution.canCommit) return;
    await commit(rows, resolution.resolved, null);
  }, [review.status, report, state.validatedRows, withResolution, resolution.canCommit, resolution.resolved, commit]);

  /**
   * Fix & Retry: commit the Rejected Rows again, as fixed (or excluded) by
   * the Importer, with their original Import Keys. Each row's Relationship
   * Field values keep the decisions they were committed with for that row
   * (a Homonym's row its own, a merged value its merge); values new or
   * changed since are decided in Resolution first.
   */
  const handleRetry = useCallback(async () => {
    if (!report || committingRef.current) return;
    const rows = fixRows;
    if (rows.some((r) => !r.excluded && !r.isValid)) return;

    let resolved: ResolvedValue[] = [];
    if (withResolution) {
      if (state.step === 'resolution' && !resolution.canCommit) return;
      // Resolution's decisions are for the rows it was shown (none unless it is open)
      const decided = retryDecisions(rows, fieldConfigs, committedValues, resolution.resolved);
      if (!decided) return;
      // A new record named like one created before is that record
      resolved = linkAlreadyCreated(decided, createdIdsRef.current);
    }
    await commit(rows, resolved, report);
  }, [
    report,
    fixRows,
    withResolution,
    state.step,
    resolution.canCommit,
    resolution.resolved,
    committedValues,
    fieldConfigs,
    commit,
  ]);

  // Fix & Retry's badges: what each value (and row) was committed with, or resolved to since
  const fixBadges = useMemo(() => {
    const badges = new Map<string, ResolvedValue>(resolution.badges);
    for (const [key, value] of committedValues) badges.set(key, combineDecisions(value, resolution.badges.get(key)));
    return badges;
  }, [resolution.badges, committedValues]);

  // The report as the Importer sees and downloads it: each row's record as
  // reviewed, i.e. with their own text where Relationship Fields were sent to
  // the Host App as Related Record IDs. onImportFinished keeps what was sent.
  const importerReport = useMemo(() => {
    if (!report) return null;
    const reviewed = new Map(state.validatedRows.map((row) => [row.rowIndex, row.data]));
    const asReviewed = <T extends ImportRow<TRecord>>(row: T): T => ({ ...row, record: reviewed.get(row.rowIndex) ?? row.record });
    return {
      created: report.created.map(asReviewed),
      rejected: report.rejected.map(asReviewed),
      excluded: report.excluded.map(asReviewed),
    };
  }, [report, state.validatedRows]);

  return (
    <WizardRoot className={cn('w-full max-w-4xl mx-auto', className)} messages={messages}>
      {/* Optional heading; omitted so the wizard can sit under a Host App's own */}
      {(title || description) && (
        <div className="mb-8 space-y-1 text-center">
          {title && <h2 className="text-2xl font-semibold text-foreground">{title}</h2>}
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
      )}

      {/* Step indicator */}
      <StepIndicator currentStep={state.step} withResolution={withResolution} />

      {/* Content */}
      <div className="mt-8">
        {state.step === 'upload' && (
          <FileUploader
            onFileSelected={handleFileSelected}
            fields={fieldConfigs}
            acceptedFileTypes={acceptedFileTypes}
            maxFileSize={maxFileSize}
            isLoading={state.isLoading}
            error={state.error}
          />
        )}

        {state.step === 'mapping' && (
          <ColumnMapper
            mappings={state.columnMappings}
            fields={fieldConfigs}
            onMappingChange={handleMappingChange}
            onConfirm={startReview}
            isLoading={state.isLoading}
          />
        )}

        {state.step === 'validation' && review.status === 'loading' && (
          <ChoiceOptionsLoading fieldLabels={loaderFieldLabels(fieldConfigs)} onBack={handleBack} />
        )}

        {state.step === 'validation' && review.status === 'error' && (
          <ChoiceOptionsError
            message={m.options.loadFailed({ field: review.field, reason: review.reason })}
            onRetry={startReview}
            onBack={handleBack}
          />
        )}

        {state.step === 'validation' && review.status === 'ready' && (
          <DataValidator
            validatedRows={state.validatedRows}
            fields={review.fields}
            validateRow={customValidator}
            aiEdit={aiEdit}
            onComplete={withResolution ? startResolution : handleCommit}
            onBack={handleBack}
            onRowsChange={handleRowsChange}
            relatedValues={withResolution ? resolution.badges : undefined}
            isLoading={state.isLoading}
          />
        )}

        {state.step === 'resolution' && (
          <ResolutionStep
            kinds={resolution.kinds}
            lookup={resolution.lookup}
            resolved={resolution.resolved}
            names={resolution.names}
            blockers={resolution.blockers}
            canCommit={resolution.canCommit}
            rowCount={(report ? fixRows : state.validatedRows).filter((r) => !r.excluded).length}
            retrying={report !== null}
            describeRow={describeRow}
            onNameChange={resolution.setName}
            onChoose={resolution.choose}
            onChooseForRow={resolution.chooseForRow}
            onMergeChange={resolution.setMerge}
            onRetry={startResolution}
            onBack={handleBackToReview}
            onComplete={report ? handleRetry : handleCommit}
          />
        )}

        {state.step === 'commit' && (
          <CommitProgress done={commitProgress.done} total={commitProgress.total} retry={commitProgress.retry} />
        )}

        {state.step === 'report' && importerReport && (
          <ImportReportView
            report={importerReport}
            fields={fieldConfigs}
            actions={
              importerReport.rejected.length > 0 && (
                <div className="space-y-3">
                  {state.parsedData && (
                    <RejectedRowsDownload
                      file={state.parsedData}
                      mappings={state.columnMappings}
                      fields={fieldConfigs}
                      rejected={importerReport.rejected}
                      unedited={uneditedRecords}
                      acceptedFileTypes={acceptedFileTypes}
                    />
                  )}
                  <div className="flex justify-end">
                    <Button size="lg" className="gap-2" onClick={handleOpenFix}>
                      <Wrench className="h-4 w-4" aria-hidden="true" />
                      {m.fix.open({ count: importerReport.rejected.length })}
                    </Button>
                  </div>
                </div>
              )
            }
          />
        )}

        {state.step === 'fix' && review.status === 'ready' && (
          <DataValidator
            validatedRows={fixRows}
            fields={review.fields}
            validateRow={customValidator}
            aiEdit={aiEdit}
            onComplete={fixNeedsResolution ? startResolution : handleRetry}
            onBack={handleBackToReport}
            onRowsChange={handleRowsChange}
            relatedValues={withResolution ? fixBadges : undefined}
            rejections={rejections}
            continuesToResolution={fixNeedsResolution}
          />
        )}
      </div>
    </WizardRoot>
  );
}

/** Labels of the choice fields whose options are loaded when the review starts */
function loaderFieldLabels(fields: FieldConfig[]): string[] {
  return fields.filter((f) => f.type === 'choice' && typeof f.options === 'function').map((f) => f.label);
}

interface StepIndicatorProps {
  currentStep: WizardStep;
  /** Whether the Output Shape has Relationship Fields, so there is a Resolution step */
  withResolution: boolean;
}

/**
 * Whether a row of fixed-size items is wider than its container. The row's
 * natural width is measured while it is shown in full, so switching to the
 * compact form can't flip it back; a change of `contentKey` (e.g. translated
 * labels) measures again. Without ResizeObserver it stays in full.
 */
function useCompactWhenOverflowing(contentKey: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const fullWidthRef = useRef(0);

  useLayoutEffect(() => {
    setCompact(false);
    fullWidthRef.current = 0;
  }, [contentKey]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const row = rowRef.current;
    if (!container || !row || typeof ResizeObserver === 'undefined') return;
    const check = () => {
      if (!compact) fullWidthRef.current = row.scrollWidth;
      setCompact(container.clientWidth + 1 < fullWidthRef.current);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(container);
    return () => observer.disconnect();
  }, [compact, contentKey]);

  return { containerRef, rowRef, compact };
}

function StepIndicator({ currentStep, withResolution }: StepIndicatorProps) {
  const m = useMessages();
  const steps: Array<{ key: WizardStep; label: string; number: number }> = [
    { key: 'upload' as const, label: m.steps.upload() },
    { key: 'mapping' as const, label: m.steps.mapping() },
    { key: 'validation' as const, label: m.steps.review() },
    ...(withResolution ? [{ key: 'resolution' as const, label: m.steps.resolution() }] : []),
    { key: 'commit' as const, label: m.steps.import() },
  ].map((step, index) => ({ ...step, number: index + 1 }));

  // Commit, the Import Report and Fix & Retry are all the import step
  const currentIndex = steps.findIndex(
    (s) => s.key === (currentStep === 'report' || currentStep === 'fix' ? 'commit' : currentStep)
  );

  const { containerRef, rowRef, compact } = useCompactWhenOverflowing(steps.map((s) => s.label).join('|'));

  // When the full indicator doesn't fit its container (e.g. a Host App's drawer, or a phone),
  // lines and gaps shrink and only the current step keeps a visible label
  return (
    <div
      ref={containerRef}
      data-step-indicator=""
      data-compact={compact || undefined}
      // Even compact, a very narrow container scrolls the row rather than widen the page
      className={cn(compact && 'overflow-x-auto')}
    >
      <div ref={rowRef} className={cn('flex items-center justify-center', compact ? 'gap-2' : 'gap-6')}>
        {steps.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isActive = isComplete || isCurrent;

          return (
            <React.Fragment key={step.key}>
              {index > 0 && (
                <div
                  className={cn(
                    'h-px shrink-0 transition-colors',
                    compact ? 'w-4' : 'w-8',
                    isActive ? 'bg-[hsl(var(--step-active))]' : 'bg-border'
                  )}
                />
              )}
              <div className="flex shrink-0 items-center gap-2" aria-current={isCurrent ? 'step' : undefined}>
                <div
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all',
                    isActive
                      ? 'bg-[hsl(var(--step-active))] text-white'
                      : 'bg-muted text-[hsl(var(--step-inactive))]'
                  )}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : step.number}
                </div>
                <span
                  className={cn(
                    'whitespace-nowrap text-sm font-medium transition-colors',
                    compact && !isCurrent && 'sr-only',
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
    </div>
  );
}
