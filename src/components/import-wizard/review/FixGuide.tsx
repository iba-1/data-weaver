import { forwardRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Info, ListRestart, Undo2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FieldConfig } from '@/lib/import-wizard/types';
import type { IssueGroup, IssueGroupValue } from '@/lib/import-wizard/issueGroups';
import { numberExample } from '@/lib/import-wizard/issueGroups';
import { choiceLabel, choiceOptions } from '@/lib/import-wizard/choices';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMessages } from '../messages';
import { groupTitle } from './issueLabels';

/** Distinct values listed one by one before the guide falls back to cell-by-cell navigation */
const LISTED_VALUES = 4;

interface FixGuideProps<TKey extends string> {
  /** The problem being fixed, as it was when the Importer chose it */
  group: IssueGroup;
  /** The same problem now; absent once every row of it is fixed */
  live?: IssueGroup;
  field: FieldConfig<TKey>;
  /** Replace one value in the rows of this problem that still hold it */
  onReplace: (text: string, replacement: string) => void;
  onGoTo: (rowIndex: number) => void;
  onNextCell: () => void;
  onShowAll: () => void;
  /** Absent when there's no other problem left */
  onNextProblem?: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onExclude: () => void;
}

/**
 * The strip above the grid while one kind of problem is being fixed: which
 * problem and how many rows, what's wrong and what to do (with the value as
 * written), the control to fix it, and the way back to every row. Nothing
 * essential depends on hovering.
 */
export const FixGuide = forwardRef<HTMLHeadingElement, FixGuideProps<string>>(function FixGuide(
  { group, live, field, onReplace, onGoTo, onNextCell, onShowAll, onNextProblem, onUndo, canUndo, onExclude },
  headingRef
) {
  const m = useMessages();
  const title = groupTitle(m, group, field.label);
  const isError = group.kind === 'error';
  const remaining = live?.rowIndexes.length ?? 0;

  return (
    <section
      aria-labelledby="dw-fix-guide-title"
      data-fix-guide=""
      className={cn(
        'rounded-lg border-l-4 bg-background px-4 py-2.5 shadow-sm ring-1',
        isError ? 'border-l-destructive ring-destructive/20' : 'border-l-warning ring-warning/20'
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.review.guideLabel()}</span>
        <h4
          id="dw-fix-guide-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-base font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {title}
          {live && <span className="ml-2 font-normal text-muted-foreground">{m.review.guideRows({ count: remaining })}</span>}
        </h4>
        <Button type="button" variant="ghost" size="sm" className="ml-auto h-8 gap-1.5" onClick={onShowAll}>
          <ListRestart className="h-4 w-4" aria-hidden="true" />
          {m.review.guideShowAll()}
        </Button>
      </div>

      {!live ? (
        <div role="status" className="mt-2 flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            {m.review.guideResolved()}
          </p>
          {onNextProblem && (
            <Button type="button" size="sm" className="gap-1.5" onClick={onNextProblem}>
              {m.review.guideNextProblem()}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onUndo} disabled={!canUndo}>
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            {m.review.guideUndo()}
          </Button>
        </div>
      ) : (
        <div className="mt-1.5 space-y-2">
          <Explanation group={live} field={field} onReplace={onReplace} onGoTo={onGoTo} onNextCell={onNextCell} />
          {!isError && <p className="text-sm text-muted-foreground">{m.review.guideNotBlocking()}</p>}
          {field.fixHint && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {field.fixHint}
            </p>
          )}
          {isError && (
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={onExclude}>
                {m.review.guideExclude({ count: remaining })}
              </button>
              <span>{m.review.guideExcludeHint()}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
});

function Explanation<TKey extends string>({
  group,
  field,
  onReplace,
  onGoTo,
  onNextCell,
}: {
  group: IssueGroup;
  field: FieldConfig<TKey>;
  onReplace: (text: string, replacement: string) => void;
  onGoTo: (rowIndex: number) => void;
  onNextCell: () => void;
}) {
  const m = useMessages();
  const options = choiceOptions(field);

  // One value repeated on many rows: pick the value to use, see what changes, apply to those rows
  if (group.cause === 'notAnOption' && options && options.length > 0) {
    return (
      <div className="space-y-2">
        <ul className="space-y-1.5">
          {group.values.map((value) => (
            <ReplaceValue key={value.text} value={value} field={field} onReplace={onReplace} />
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{m.review.guideEachCell()}</p>
      </div>
    );
  }

  // Every cell holds something different: go from cell to cell
  if (group.cause === 'required') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-foreground">{m.review.guideRequired({ field: field.label })}</p>
        <CellNavigation onFirst={() => onGoTo(group.rowIndexes[0])} onNext={onNextCell} />
      </div>
    );
  }

  const values = group.values.slice(0, LISTED_VALUES);
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {values.map((value) => (
          <li key={value.text} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-foreground">{explain(m, group, field, value.text)}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2"
              onClick={() => onGoTo(value.rowIndexes[0])}
            >
              {m.review.guideGoToRow({ row: value.rowIndexes[0] + 1 })}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {group.values.length > LISTED_VALUES && <CellNavigation onFirst={() => onGoTo(group.rowIndexes[0])} onNext={onNextCell} />}
      <p className="text-sm text-muted-foreground">{m.review.guideEachCell()}</p>
    </div>
  );
}

function explain<TKey extends string>(
  m: ReturnType<typeof useMessages>,
  group: IssueGroup,
  field: FieldConfig<TKey>,
  value: string
): string {
  const ref = group.messageRef;
  switch (group.cause) {
    case 'invalidNumber': {
      const example = numberExample(value);
      return example
        ? m.review.guideInvalidNumber({ field: field.label, value, example })
        : m.review.guideInvalidNumberNoExample({ field: field.label, value });
    }
    case 'invalidDate':
      return m.review.guideInvalidDate({
        field: field.label,
        value,
        format: ref?.key === 'invalidDate' ? ref.params.format : 'DD/MM/YYYY',
      });
    case 'ambiguousNumber':
      return ref?.key === 'ambiguousNumber'
        ? m.review.guideAmbiguousNumber({ field: field.label, text: ref.params.text, value: ref.params.value })
        : m.review.guideOther({ field: field.label, message: group.message });
    case 'notAnOption':
      return m.review.guideNotAnOption({ field: field.label, value });
    default:
      return m.review.guideOther({ field: field.label, message: group.message });
  }
}

function CellNavigation({ onFirst, onNext }: { onFirst: () => void; onNext: () => void }) {
  const m = useMessages();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" className="gap-1.5" onClick={onFirst}>
        <Wrench className="h-4 w-4" aria-hidden="true" />
        {m.review.guideFirst()}
      </Button>
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onNext}>
        {m.review.guideNext()}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

/** "metri" · 2 rows → [choose] [Replace "metri" with "M" in 2 rows] */
function ReplaceValue<TKey extends string>({
  value,
  field,
  onReplace,
}: {
  value: IssueGroupValue;
  field: FieldConfig<TKey>;
  onReplace: (text: string, replacement: string) => void;
}) {
  const m = useMessages();
  const options = choiceOptions(field) ?? [];
  const [replacement, setReplacement] = useState('');
  const chosen = options.find((o) => o.value === replacement);
  const count = value.rowIndexes.length;
  const explanationId = `dw-fix-${field.key}-${value.text}`;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-muted/40 px-3 py-1.5">
      <p id={explanationId} className="min-w-[16rem] flex-1 text-sm text-foreground">
        <span className="sr-only">{m.review.guideValueRows({ value: value.text, count })}: </span>
        {m.review.guideNotAnOption({ field: field.label, value: value.text })}
        <span className="ml-2 whitespace-nowrap text-muted-foreground">{m.review.guideRows({ count })}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={replacement} onValueChange={setReplacement}>
          <SelectTrigger
            className="h-8 w-48 bg-background"
            aria-label={m.review.guideChoose({ value: value.text })}
            aria-describedby={explanationId}
          >
            <SelectValue placeholder={m.review.guideChoosePlaceholder()} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {choiceLabel(option)}
                {option.label !== undefined && option.label !== option.value && (
                  <span className="ml-2 text-xs text-muted-foreground">{option.value}</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={!chosen}
          onClick={() => chosen && onReplace(value.text, chosen.value)}
        >
          {chosen
            ? m.review.guideApply({ value: value.text, replacement: choiceLabel(chosen), count })
            : m.review.guideApplyPending({ count })}
        </Button>
      </div>
    </li>
  );
}
