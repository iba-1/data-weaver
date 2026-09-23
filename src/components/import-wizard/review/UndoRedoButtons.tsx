import { Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMessages } from '../messages';

interface UndoRedoButtonsProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function UndoRedoButtons({ onUndo, onRedo, canUndo, canRedo }: UndoRedoButtonsProps) {
  const m = useMessages();
  return (
    <div className="flex items-center border rounded-md">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={m.review.undo()}
            className="h-8 px-2 rounded-r-none border-r"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{m.review.undo()}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label={m.review.redo()}
            className="h-8 px-2 rounded-l-none"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{m.review.redo()}</TooltipContent>
      </Tooltip>
    </div>
  );
}
