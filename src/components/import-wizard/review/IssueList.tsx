import { useMemo } from 'react';
import { AlertCircle, AlertTriangle, Filter } from 'lucide-react';
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
}: {
  rows: RowValidation<TRecord>[];
  fields: FieldConfig<TKey>[];
  onFilterChange: (filter: RowFilter) => void;
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

  return (
    <section aria-label={m.review.issuesTitle()} className="rounded-lg border bg-muted/30 p-3">
      <h4 className="mb-2 text-sm font-semibold text-foreground">{m.review.issuesTitle()}</h4>
      <ul className="max-h-36 space-y-1 overflow-y-auto">
        {groups.map((g) => {
          const Icon = g.kind === 'error' ? AlertCircle : AlertTriangle;
          return (
            <li key={`${g.kind}${g.field}${g.message}`} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  'inline-flex w-24 shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                  g.kind === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning'
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {g.kind === 'error' ? m.review.issueError() : m.review.issueWarning()}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
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
    </section>
  );
}
