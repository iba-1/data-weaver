import { AlertCircle, AlertTriangle, Ban, Rows3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { getValidationSummary } from '@/lib/import-wizard/validator';
import { Badge } from '@/components/ui/badge';
import type { RowFilter } from './useVisibleRows';
import { useMessages } from '../messages';

interface ReviewSummaryProps {
  summary: ReturnType<typeof getValidationSummary>;
  filter: RowFilter;
  onFilterChange: (filter: RowFilter) => void;
}

/**
 * All / blocked / with warnings / excluded rows, each badge filtering the grid
 * to those rows, and how many rows the import will send. Blocked rows are the
 * loud one; warnings stay quiet.
 */
export function ReviewSummary({ summary, filter, onFilterChange }: ReviewSummaryProps) {
  const m = useMessages();
  const importable = summary.valid + summary.withWarnings;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant={filter === 'all' ? 'default' : 'outline'}
        className="cursor-pointer"
        onClick={() => onFilterChange('all')}
      >
        <Rows3 className="mr-1 h-3 w-3" />
        {m.review.filterAll({ count: summary.total })}
      </Badge>
      <Badge
        variant={filter === 'errors' ? 'default' : 'outline'}
        className={cn(
          'cursor-pointer',
          summary.withErrors > 0 && filter !== 'errors' && 'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90'
        )}
        onClick={() => onFilterChange('errors')}
      >
        <AlertCircle className="mr-1 h-3 w-3" />
        {m.review.filterErrors({ count: summary.withErrors })}
      </Badge>
      <Badge
        variant={filter === 'warnings' ? 'default' : 'outline'}
        className={cn('cursor-pointer', filter !== 'warnings' && 'text-muted-foreground')}
        onClick={() => onFilterChange('warnings')}
      >
        <AlertTriangle className="mr-1 h-3 w-3" />
        {m.review.filterWarnings({ count: summary.withWarnings })}
      </Badge>
      <Badge
        variant={filter === 'excluded' ? 'default' : 'outline'}
        className="cursor-pointer"
        onClick={() => onFilterChange('excluded')}
      >
        <Ban className="mr-1 h-3 w-3" />
        {m.review.filterExcluded({ count: summary.excluded })}
      </Badge>
      <span className="text-sm font-medium text-foreground">{m.review.importableCount({ count: importable })}</span>
    </div>
  );
}
