import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FieldConfig } from '@/lib/import-wizard/types';
import type { IssueGroup } from '@/lib/import-wizard/issueGroups';
import { Button } from '@/components/ui/button';
import { useMessages } from '../messages';
import { groupTitle } from './issueLabels';

/** Entries shown before "Show N more", so the grid keeps its room */
const VISIBLE_GROUPS = 3;

interface IssueSummaryProps<TKey extends string> {
  errorGroups: IssueGroup[];
  warningGroups: IssueGroup[];
  /** Included rows with at least one error, each counted once */
  blockedRows: number;
  fields: FieldConfig<TKey>[];
  /** The group the guide is on, if any */
  activeGroupId?: string;
  /** While the guide is open: one line, so the grid keeps its room */
  compact?: boolean;
  onFix: (group: IssueGroup) => void;
  notesAccepted: boolean;
  onNotesAcceptedChange: (accepted: boolean) => void;
}

/**
 * What blocks the import, one entry per kind of problem with how many rows it
 * touches and a Fix action; warnings apart and quiet. It orients: the full
 * explanation and the fix itself are in the guide above the grid.
 */
export function IssueSummary<TKey extends string>({
  errorGroups,
  warningGroups,
  blockedRows,
  fields,
  activeGroupId,
  compact = false,
  onFix,
  notesAccepted,
  onNotesAcceptedChange,
}: IssueSummaryProps<TKey>) {
  const m = useMessages();
  const [showAll, setShowAll] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const label = (group: IssueGroup) => fields.find((f) => f.key === group.field)?.label ?? group.field;
  // Warnings are counted one by one (a row can have two), unlike blocked rows
  const warningCount = warningGroups.reduce((sum, g) => sum + g.rowIndexes.length, 0);
  const shown = showAll ? errorGroups : errorGroups.slice(0, VISIBLE_GROUPS);

  if (compact) {
    return (
      <nav aria-label={m.review.summaryBlocked({ count: blockedRows })} className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn('flex items-center gap-1.5 font-semibold', blockedRows > 0 ? 'text-destructive' : 'text-success')}>
          {blockedRows > 0 ? <AlertCircle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          {blockedRows > 0 ? m.review.summaryBlocked({ count: blockedRows }) : m.review.summaryClear()}
        </span>
        {[...errorGroups, ...warningGroups.filter((g) => g.id === activeGroupId)].map((group) => {
          const title = groupTitle(m, group, label(group));
          const isActive = group.id === activeGroupId;
          return (
            <button
              key={group.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onFix(group)}
              className={cn(
                'max-w-[22rem] truncate rounded-full border px-2.5 py-0.5 text-xs',
                isActive ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted',
                group.kind === 'warning' && !isActive && 'border-dashed text-muted-foreground'
              )}
            >
              {title} <span className="tabular-nums opacity-70">{m.review.summaryRows({ count: group.rowIndexes.length })}</span>
            </button>
          );
        })}
        {warningCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-warning/80" aria-hidden="true" />
            {m.review.warningsTitle({ count: warningCount })}
          </span>
        )}
      </nav>
    );
  }

  return (
    <div className="space-y-2">
      {blockedRows > 0 ? (
        <section aria-labelledby="dw-summary-blocked" className="rounded-lg border-2 border-destructive/70 bg-destructive/5 px-3 py-2">
          <h4 id="dw-summary-blocked" className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {m.review.summaryBlocked({ count: blockedRows })}
          </h4>
          <ul className="mt-1.5 divide-y divide-destructive/10">
            {shown.map((group) => (
              <GroupEntry
                key={group.id}
                title={groupTitle(m, group, label(group))}
                rows={group.rowIndexes.length}
                action={m.review.summaryFix()}
                active={group.id === activeGroupId}
                onClick={() => onFix(group)}
              />
            ))}
          </ul>
          {errorGroups.length > VISIBLE_GROUPS && (
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
              {showAll ? m.review.summaryLess() : m.review.summaryMore({ count: errorGroups.length - VISIBLE_GROUPS })}
            </button>
          )}
        </section>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-sm font-medium text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {m.review.summaryClear()}
        </p>
      )}

      {warningGroups.length > 0 && (
        <section aria-label={m.review.warningsTitle({ count: warningCount })} className="rounded-lg border border-dashed px-3 py-1.5 text-muted-foreground">
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              className="inline-flex min-w-0 items-center gap-2 hover:text-foreground"
              aria-expanded={warningsOpen}
              onClick={() => setWarningsOpen((v) => !v)}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning/80" aria-hidden="true" />
              <span className="truncate">
                {notesAccepted ? m.review.notesAccepted({ count: warningCount }) : m.review.warningsTitle({ count: warningCount })}
              </span>
              {warningsOpen ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="ml-auto shrink-0 text-primary hover:underline"
              onClick={() => onNotesAcceptedChange(!notesAccepted)}
            >
              {notesAccepted ? m.review.undoAcceptNotes() : m.review.acceptNotes()}
            </button>
          </div>
          {warningsOpen && (
            <ul className="mt-1 divide-y">
              {warningGroups.map((group) => (
                <GroupEntry
                  key={group.id}
                  title={groupTitle(m, group, label(group))}
                  rows={group.rowIndexes.length}
                  action={m.review.summaryReview()}
                  active={group.id === activeGroupId}
                  onClick={() => onFix(group)}
                  quiet
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function GroupEntry({
  title,
  rows,
  action,
  active,
  onClick,
  quiet = false,
}: {
  title: string;
  rows: number;
  action: string;
  active: boolean;
  onClick: () => void;
  quiet?: boolean;
}) {
  const m = useMessages();
  return (
    <li className={cn('flex items-center gap-3 py-1', quiet ? 'text-xs' : 'text-sm')}>
      <span className={cn('min-w-0 flex-1 truncate', !quiet && 'font-medium text-foreground')} title={title}>
        {title}
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{m.review.summaryRows({ count: rows })}</span>
      <Button
        type="button"
        size="sm"
        variant={active ? 'default' : 'outline'}
        className={cn('h-7 shrink-0 gap-1 px-2.5', quiet && 'h-6 text-xs')}
        aria-pressed={active}
        aria-label={`${action}: ${title}`}
        onClick={onClick}
      >
        {!quiet && <Wrench className="h-3.5 w-3.5" aria-hidden="true" />}
        {action}
      </Button>
    </li>
  );
}
