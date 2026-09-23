import { AlertCircle, ChevronLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessages } from '../messages';

/** Shown instead of the review while choice fields' options load */
export function ChoiceOptionsLoading({ fieldLabels, onBack }: { fieldLabels: string[]; onBack: () => void }) {
  const m = useMessages();
  return (
    <div className="space-y-4">
      <p role="status" className="text-sm text-muted-foreground">
        {m.options.loading({ fields: fieldLabels.join(', '), count: fieldLabels.length })}
      </p>
      <Skeleton className="h-64 w-full" />
      <Button variant="outline" onClick={onBack}>
        <ChevronLeft className="mr-2 h-4 w-4" />
        {m.review.back()}
      </Button>
    </div>
  );
}

interface ChoiceOptionsErrorProps {
  message: string;
  onRetry: () => void;
  onBack: () => void;
}

/** Shown instead of the review when options failed to load: the import can't complete until they do */
export function ChoiceOptionsError({ message, onRetry, onBack }: ChoiceOptionsErrorProps) {
  const m = useMessages();
  return (
    <div className="space-y-4">
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">{message}</p>
          <p className="text-muted-foreground">{m.options.blocked()}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          {m.review.back()}
        </Button>
        <Button onClick={onRetry}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {m.options.retry()}
        </Button>
      </div>
    </div>
  );
}
