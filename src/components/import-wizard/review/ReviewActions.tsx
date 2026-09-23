import { ChevronLeft, Download } from 'lucide-react';
import type { getValidationSummary } from '@/lib/import-wizard/validator';
import { Button } from '@/components/ui/button';

interface ReviewActionsProps {
  summary: ReturnType<typeof getValidationSummary>;
  onBack: () => void;
  onComplete: () => void;
}

/** Sticky footer: back to mapping, or complete the import once no included row has errors */
export function ReviewActions({ summary, onBack, onComplete }: ReviewActionsProps) {
  return (
    <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t pt-4 pb-2 -mx-1 px-1 z-10">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Mapping
        </Button>
        <div className="flex items-center gap-3">
          {summary.excluded > 0 && (
            <span className="text-sm text-muted-foreground">{summary.excluded} excluded</span>
          )}
          <Button onClick={onComplete} disabled={summary.withErrors > 0} size="lg">
            <Download className="mr-2 h-4 w-4" />
            Complete Import ({summary.valid + summary.withWarnings} rows)
          </Button>
        </div>
      </div>
    </div>
  );
}
