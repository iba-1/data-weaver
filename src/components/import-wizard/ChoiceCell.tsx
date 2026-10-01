import { cn } from '@/lib/utils';
import type { ChoiceOption } from '@/lib/import-wizard/types';
import { choiceLabel } from '@/lib/import-wizard/choices';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger } from '@/components/ui/select';
import { useMessages } from './messages';

/** Picker value for "clear this cell"; option values are never control characters */
const CLEAR = '\u0000clear';

interface ChoiceCellProps {
  value: unknown;
  /** The field's options, already loaded */
  options: ChoiceOption[];
  /** Called with the picked option's value, or '' when the cell is cleared */
  onSave: (value: string) => void;
  /** Accessible name, e.g. "Currency, row 3" */
  'aria-label': string;
  hasError?: boolean;
  hasWarning?: boolean;
  /** Shown as the cell's description, e.g. the valid options */
  message?: string;
  isHighlighted?: boolean;
  className?: string;
}

/**
 * A choice field's cell: shows the stored value (or the text that matched no
 * option) and is edited with a picker listing the options.
 */
export function ChoiceCell({
  value,
  options,
  onSave,
  'aria-label': ariaLabel,
  hasError = false,
  hasWarning = false,
  message,
  isHighlighted = false,
  className,
}: ChoiceCellProps) {
  const m = useMessages();
  const text = value === null || value === undefined ? '' : String(value);
  const selected = options.some((o) => o.value === text) ? text : '';

  return (
    <Select value={selected} onValueChange={(picked) => onSave(picked === CLEAR ? '' : picked)}>
      <SelectTrigger
        aria-label={ariaLabel}
        aria-invalid={hasError || undefined}
        title={message}
        className={cn(
          'h-7 min-h-[28px] -mx-1 gap-1 rounded border-transparent bg-transparent px-2 py-1 text-left text-sm ring-offset-0 transition-all',
          'hover:bg-muted/60 hover:ring-1 hover:ring-border focus:ring-2 focus:ring-primary focus:ring-offset-0',
          hasError && 'bg-destructive/15 font-medium text-destructive ring-2 ring-inset ring-destructive',
          hasWarning && !hasError && 'relative after:absolute after:right-0 after:top-0 after:border-[4px] after:border-transparent after:border-r-warning/70 after:border-t-warning/70 after:content-[""]',
          isHighlighted && 'bg-primary/20 ring-1 ring-primary/40',
          className
        )}
      >
        {text ? (
          <span className="truncate">{text}</span>
        ) : (
          <span className="text-muted-foreground/60 italic">{m.cell.empty()}</span>
        )}
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
        {text && (
          <>
            <SelectSeparator />
            <SelectItem value={CLEAR} className="text-muted-foreground">
              {m.cell.clear()}
            </SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
