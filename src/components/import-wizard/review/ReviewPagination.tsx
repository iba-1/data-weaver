import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReviewPaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalRows: number;
  previousPage: () => void;
  nextPage: () => void;
}

/** Page controls for the review grid; hidden when everything fits on one page */
export function ReviewPagination({
  currentPage,
  totalPages,
  pageSize,
  totalRows,
  previousPage,
  nextPage,
}: ReviewPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {currentPage * pageSize + 1}-
        {Math.min((currentPage + 1) * pageSize, totalRows)} of{' '}
        {totalRows} rows
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={previousPage} disabled={currentPage === 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {currentPage + 1} of {totalPages}
        </span>
        <Button variant="outline" size="sm" onClick={nextPage} disabled={currentPage === totalPages - 1}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
