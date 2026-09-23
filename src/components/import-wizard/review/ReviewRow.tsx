import { memo } from 'react';
import { AlertCircle, AlertTriangle, Ban, Check, Link2, Plus, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FieldConfig, RowValidation } from '@/lib/import-wizard/types';
import { matchesSearch } from '@/lib/import-wizard/search';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { choiceOptions } from '@/lib/import-wizard/choices';
import { EditableCell } from '../EditableCell';
import { issueText } from '@/lib/import-wizard/messages';
import { ChoiceCell } from '../ChoiceCell';
import { useMessages } from '../messages';
import { relatedValueKey, relatedValueOf, type ResolvedValue } from '@/lib/import-wizard/resolution';

interface ReviewRowProps<TRecord, TKey extends string> {
  row: RowValidation<TRecord>;
  /** Position in the grid for assistive tech (the header is row 1) */
  ariaRowIndex: number;
  fields: FieldConfig<TKey>[];
  onCellEdit: (rowIndex: number, fieldKey: TKey, newValue: string) => void;
  onToggleExcluded: (rowIndex: number, excluded: boolean) => void;
  searchQuery: string;
  /** Relationship Field values as last resolved, by relatedValueKey: their cells show a badge */
  relatedValues?: ReadonlyMap<string, ResolvedValue>;
}

/** Every grid row is this tall (px); the virtualised grid positions rows with it */
export const REVIEW_ROW_HEIGHT = 45;

/** Compact cells keep every row exactly REVIEW_ROW_HEIGHT tall */
const CELL = 'px-3 py-2';

function rowClassName<TRecord>(row: RowValidation<TRecord>): string {
  if (row.excluded) return 'opacity-50';
  if (!row.isValid) return 'validation-row-error';
  if (row.warnings.length > 0) return 'validation-row-warning';
  return '';
}

/**
 * One row of the review grid: exclude toggle, status and an editable cell per
 * field. Memoised: while scrolling, rows that stay in view don't re-render,
 * and an edit re-renders only the row it changed.
 */
export const ReviewRow = memo(ReviewRowView) as typeof ReviewRowView;

function ReviewRowView<TRecord, TKey extends string>({
  row,
  ariaRowIndex,
  fields,
  onCellEdit,
  onToggleExcluded,
  searchQuery,
  relatedValues,
}: ReviewRowProps<TRecord, TKey>) {
  const m = useMessages();
  const data = row.data as Record<string, unknown>;
  const rowNumber = row.rowIndex + 1;

  return (
    <TableRow
      className={rowClassName(row)}
      style={{ height: REVIEW_ROW_HEIGHT }}
      aria-rowindex={ariaRowIndex}
    >
      <TableCell className={cn(CELL, 'font-mono text-xs text-muted-foreground')}>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={row.excluded ? m.review.includeRow({ row: rowNumber }) : m.review.excludeRow({ row: rowNumber })}
                onClick={() => onToggleExcluded(row.rowIndex, !row.excluded)}
              >
                {row.excluded ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {row.excluded ? m.review.includeRowHint() : m.review.excludeRowHint()}
            </TooltipContent>
          </Tooltip>
          {rowNumber}
        </div>
      </TableCell>
      <TableCell className={CELL}>
        <RowStatus row={row} />
      </TableCell>
      {fields.map((field) => {
        const value = data[field.key];
        const error = row.errors.find((e) => e.field === field.key);
        const warning = row.warnings.find((w) => w.field === field.key);
        const issue = error ?? warning;

        // Every kind of cell sits in the same compact TableCell, so rows stay REVIEW_ROW_HEIGHT tall
        return (
          <TableCell key={field.key} className={CELL}>
            {field.type === 'choice' ? (
              <ChoiceCell
                value={value}
                options={choiceOptions(field) ?? []}
                onSave={(newValue) => onCellEdit(row.rowIndex, field.key, newValue)}
                aria-label={m.review.cellLabel({ field: field.label, row: rowNumber })}
                hasError={!!error && !row.excluded}
                hasWarning={!!warning && !row.excluded}
                message={issue && issueText(m, issue)}
                isHighlighted={matchesSearch(value, searchQuery)}
                className={cn(row.excluded && 'line-through')}
              />
            ) : (
              <div className="flex min-w-0 items-center gap-1">
                <EditableCell
                  value={value as string | number | null}
                  onSave={(newValue) => onCellEdit(row.rowIndex, field.key, newValue)}
                  hasError={!!error && !row.excluded}
                  hasWarning={!!warning && !row.excluded}
                  isHighlighted={matchesSearch(value, searchQuery)}
                  className={cn('min-w-0 flex-1', row.excluded && 'line-through')}
                />
                {field.relationship && relatedValues && !row.excluded && (
                  <RelatedBadge resolved={relatedValues.get(relatedValueKey(field.relationship.kind, relatedValueOf(value)))} />
                )}
              </div>
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/**
 * The Related Record a Relationship Field cell resolved to: the existing
 * record's name, the name a new one will be created with, or that the value
 * still needs a decision. The cell itself keeps the file's text.
 */
function RelatedBadge({ resolved }: { resolved: ResolvedValue | undefined }) {
  const m = useMessages();
  if (!resolved) return null;
  const { decision } = resolved;
  const [text, Icon, tone] = !decision
    ? [m.resolution.badgeUndecided(), AlertTriangle, 'border-warning/40 text-warning']
    : decision.action === 'link'
      ? [m.resolution.badgeLinked({ name: decision.name }), Link2, 'border-success/40 text-success']
      : [m.resolution.badgeNew({ name: decision.name }), Plus, 'border-primary/40 text-primary'];
  return (
    <span
      className={cn('inline-flex max-w-[50%] shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px]', tone)}
      title={text}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </span>
  );
}

function RowStatus<TRecord>({ row }: { row: RowValidation<TRecord> }) {
  const m = useMessages();
  if (row.excluded) {
    return <Ban className="h-4 w-4 text-muted-foreground" aria-label={m.review.excludedStatus()} />;
  }
  if (!row.isValid) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <AlertCircle className="h-4 w-4 text-destructive" />
        </TooltipTrigger>
        <TooltipContent>{row.errors.map((e) => issueText(m, e)).join(', ')}</TooltipContent>
      </Tooltip>
    );
  }
  if (row.warnings.length > 0) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <AlertTriangle className="h-4 w-4 text-warning" />
        </TooltipTrigger>
        <TooltipContent>{row.warnings.map((w) => issueText(m, w)).join(', ')}</TooltipContent>
      </Tooltip>
    );
  }
  return <Check className="h-4 w-4 text-success" />;
}
