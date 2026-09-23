import { ChevronLeft, Download } from 'lucide-react';
import type { getValidationSummary } from '@/lib/import-wizard/validator';
import { Button } from '@/components/ui/button';
import { useMessages } from '../messages';

interface ReviewActionsProps {
  summary: ReturnType<typeof getValidationSummary>;
  onBack: () => void;
  onComplete: () => void;
  /** The Output Shape has Relationship Fields: the next step is Resolution, not the import */
  continuesToResolution?: boolean;
  /** Fix & Retry: back to the Import Report, and on to import the rows again */
  retrying?: boolean;
}

/**
 * Sticky footer: back (to mapping, or to the Import Report in Fix & Retry),
 * or on (to Resolution or the import) once no included row has errors
 */
export function ReviewActions({
  summary,
  onBack,
  onComplete,
  continuesToResolution = false,
  retrying = false,
}: ReviewActionsProps) {
  const m = useMessages();
  const count = summary.valid + summary.withWarnings;
  return (
    <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t pt-4 pb-2 -mx-1 px-1 z-10">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          {retrying ? m.fix.back() : m.review.back()}
        </Button>
        <div className="flex items-center gap-3">
          {summary.excluded > 0 && (
            <span className="text-sm text-muted-foreground">{m.review.excludedCount({ count: summary.excluded })}</span>
          )}
          <Button onClick={onComplete} disabled={summary.withErrors > 0} size="lg">
            <Download className="mr-2 h-4 w-4" />
            {continuesToResolution
              ? m.review.continueToResolution({ count })
              : retrying
                ? m.fix.retry({ count })
                : m.review.complete({ count })}
          </Button>
        </div>
      </div>
    </div>
  );
}
