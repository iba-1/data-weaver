import { Loader2 } from 'lucide-react';
import { useMessages } from '../messages';

interface CommitProgressProps {
  /** Rows with an outcome so far, saved or rejected */
  done: number;
  /** Rows being committed */
  total: number;
  /** Set while a batch that failed in transit is being sent again */
  retry?: { attempt: number; attempts: number } | null;
}

/** Shown instead of the review while rows are being saved: nothing can be edited until Commit is over */
export function CommitProgress({ done, total, retry }: CommitProgressProps) {
  const m = useMessages();
  const percent = total === 0 ? 100 : Math.round((done / total) * 100);
  const progressText = m.commit.progress({ done, total });

  return (
    <div className="space-y-4 rounded-lg border bg-card p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-foreground">{m.commit.title()}</h3>
      </div>
      <div
        role="progressbar"
        aria-label={m.commit.progressLabel()}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={progressText}
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      {/* One live region, so a retry is announced along with the progress */}
      <div role="status" className="space-y-1 text-sm">
        <p className="font-medium text-foreground">{progressText}</p>
        {retry && <p className="text-warning">{m.commit.retrying(retry)}</p>}
      </div>
      <p className="text-sm text-muted-foreground">{m.commit.keepOpen()}</p>
    </div>
  );
}
