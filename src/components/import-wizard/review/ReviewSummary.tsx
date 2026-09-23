import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { getValidationSummary } from '@/lib/import-wizard/validator';
import { Badge } from '@/components/ui/badge';
import type { RowFilter } from './useVisibleRows';

interface ReviewSummaryProps {
  summary: ReturnType<typeof getValidationSummary>;
  filter: RowFilter;
  onFilterChange: (filter: RowFilter) => void;
}

/** Valid / warning / error counts; each badge filters the grid to those rows */
export function ReviewSummary({ summary, filter, onFilterChange }: ReviewSummaryProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        variant={filter === 'all' ? 'default' : 'outline'}
        className="cursor-pointer"
        onClick={() => onFilterChange('all')}
      >
        <CheckCircle className="mr-1 h-3 w-3" />
        {summary.valid} Valid
      </Badge>
      <Badge
        variant={filter === 'warnings' ? 'default' : 'outline'}
        className={cn(
          'cursor-pointer',
          summary.withWarnings > 0 && filter !== 'warnings' && 'border-warning text-warning'
        )}
        onClick={() => onFilterChange('warnings')}
      >
        <AlertTriangle className="mr-1 h-3 w-3" />
        {summary.withWarnings} Warnings
      </Badge>
      <Badge
        variant={filter === 'errors' ? 'default' : 'outline'}
        className={cn(
          'cursor-pointer',
          summary.withErrors > 0 && filter !== 'errors' && 'border-destructive text-destructive'
        )}
        onClick={() => onFilterChange('errors')}
      >
        <AlertCircle className="mr-1 h-3 w-3" />
        {summary.withErrors} Errors
      </Badge>
    </div>
  );
}
