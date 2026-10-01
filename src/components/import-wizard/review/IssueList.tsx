import { useMemo } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FieldConfig, RowValidation } from '@/lib/import-wizard/types';
import { issueText } from '@/lib/import-wizard/messages';
import { useMessages } from '../messages';
import type { RowFilter } from './useVisibleRows';

interface IssueGroup {
  kind: 'error' | 'warning';
  field: string;
  message: string;
  rows: number[];
}

/**
 * What's wrong in the file, without hovering: every distinct issue once, with
 * its kind in words, its field and how many rows have it. Errors first.
 */
export function IssueList<TRecord, TKey extends string>({
  rows,
  fields,
  onFilterChange,
  notesAccepted,
  onNotesAcceptedChange,
}: {
  rows: RowValidation<TRecord>[];
  fields: FieldConfig<TKey>[];
  onFilterChange: (filter: RowFilter) => void;
  notesAccepted: boolean;
  onNotesAcceptedChange: (accepted: boolean) => void;
}) {
  const m = useMessages();
  const groups = useMemo(() => {
    const labels = new Map(fields.map((f) => [f.key as string, f.label]));
    const byKey = new Map<string, IssueGroup>();
    const add = (kind: IssueGroup['kind'], field: string, message: string, row: number) => {
      const key = `${kind}\u0000${field}\u0000${message}`;
      const group = byKey.get(key) ?? { kind, field: labels.get(field) ?? field, message, rows: [] };
      group.rows.push(row);
      byKey.set(key, group);
    };
    for (const row of rows) {
      if (row.excluded) continue;
      for (const e of row.errors) add('error', e.field, issueText(m, e), row.rowIndex + 1);
      for (const w of row.warnings) add('warning', w.field, issueText(m, w), row.rowIndex + 1);
    }
    return [...byKey.values()].sort((a, b) => (a.kind === b.kind ? b.rows.length - a.rows.length : a.kind === 'error' ? -1 : 1));
  }, [rows, fields, m]);

  if (groups.length === 0) return null;
  const errors = groups.filter((g) => g.kind === 'error');
  const notes = groups.filter((g) => g.kind === 'warning');
  const errorRows = new Set(errors.flatMap((g) => g.rows)).size;
  const noteRows = new Set(notes.flatMap((g) => g.rows)).size;

  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <section
          aria-label={m.review.needsActionTitle({ count: errorRows })}
          className="rounded-lg border-2 border-destructive bg-destructive/5 p-3"
        >
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-destructive">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
            {m.review.needsActionTitle({ count: errorRows })}
          </h4>
          <Groups groups={errors} onFilterChange={onFilterChange} strong />
        </section>
      )}
      {notes.length > 0 && notesAccepted && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          {m.review.notesAccepted({ count: noteRows })}
          <button type="button" className="ml-auto text-primary hover:underline" onClick={() => onNotesAcceptedChange(false)}>
            {m.review.undoAcceptNotes()}
          </button>
        </div>
      )}
      {notes.length > 0 && !notesAccepted && (
        <details className="group rounded-lg border border-dashed px-3 py-2 text-muted-foreground">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-warning/80" aria-hidden="true" />
            {m.review.notesTitle({ count: noteRows })}
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-foreground hover:bg-muted"
              onClick={(e) => {
                e.preventDefault();
                onNotesAcceptedChange(true);
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              {m.review.acceptNotes()}
            </button>
            <span className="text-[10px] group-open:hidden">▸</span>
            <span className="hidden text-[10px] group-open:inline">▾</span>
          </summary>
          <div className="mt-2">
            <Groups groups={notes} onFilterChange={onFilterChange} />
          </div>
        </details>
      )}
    </div>
  );
}

function Groups({
  groups,
  onFilterChange,
  strong = false,
}: {
  groups: IssueGroup[];
  onFilterChange: (filter: RowFilter) => void;
  strong?: boolean;
}) {
  const m = useMessages();
  return (
      <ul className="max-h-36 space-y-1 overflow-y-auto">
        {groups.map((g) => {
          const Icon = g.kind === 'error' ? AlertCircle : AlertTriangle;
          return (
            <li key={`${g.kind}${g.field}${g.message}`} className="flex items-center gap-3 text-sm">
              {strong ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {m.review.issueError()}
                </span>
              ) : (
                <span className="sr-only">{m.review.issueWarning()}</span>
              )}
              <span className={cn('min-w-0 flex-1 truncate', strong ? 'font-medium text-foreground' : 'text-xs')}>
                {m.review.issueGroup({ field: g.field, message: g.message, count: g.rows.length })}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {m.review.rowCount({ count: g.rows.length })} · #{g.rows.slice(0, 4).join(', #')}
                {g.rows.length > 4 ? '…' : ''}
              </span>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                onClick={() => onFilterChange(g.kind === 'error' ? 'errors' : 'warnings')}
              >
                <Filter className="h-3 w-3" aria-hidden="true" />
                {m.review.showIssueRows()}
              </button>
            </li>
          );
        })}
      </ul>
  );
}
