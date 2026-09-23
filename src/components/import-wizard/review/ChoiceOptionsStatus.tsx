import { AlertCircle, ChevronLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Shown instead of the review while choice fields' options load */
export function ChoiceOptionsLoading({ fieldLabels, onBack }: { fieldLabels: string[]; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <p role="status" className="text-sm text-muted-foreground">
        Loading the options for {fieldLabels.join(', ')}…
      </p>
      <Skeleton className="h-64 w-full" />
      <Button variant="outline" onClick={onBack}>
        <ChevronLeft className="mr-2 h-4 w-4" />
        Back to Mapping
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
  return (
    <div className="space-y-4">
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">{message}</p>
          <p className="text-muted-foreground">The rows can't be reviewed or imported until the options load.</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Mapping
        </Button>
        <Button onClick={onRetry}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    </div>
  );
}
