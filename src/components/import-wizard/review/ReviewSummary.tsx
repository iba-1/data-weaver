import { AlertCircle, AlertTriangle, Ban, CheckCircle } from 'lucide-react';
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

/** Valid / warning / error / excluded counts; each badge filters the grid to those rows */
export function ReviewSummary({ summary, filter, onFilterChange }: ReviewSummaryProps) {
  const m = useMessages();
  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        variant={filter === 'all' ? 'default' : 'outline'}
        className="cursor-pointer"
        onClick={() => onFilterChange('all')}
      >
        <CheckCircle className="mr-1 h-3 w-3" />
        {m.review.filterValid({ count: summary.valid })}
      </Badge>
      <Badge
        variant={filter === 'warnings' ? 'default' : 'outline'}
        className="cursor-pointer text-muted-foreground"
        onClick={() => onFilterChange('warnings')}
      >
        <AlertTriangle className="mr-1 h-3 w-3" />
        {m.review.filterWarnings({ count: summary.withWarnings })}
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
        variant={filter === 'excluded' ? 'default' : 'outline'}
        className="cursor-pointer"
        onClick={() => onFilterChange('excluded')}
      >
        <Ban className="mr-1 h-3 w-3" />
        {m.review.filterExcluded({ count: summary.excluded })}
      </Badge>
    </div>
  );
}
