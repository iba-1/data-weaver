import { Ban, ListChecks } from 'lucide-react';
import type {
  AiEditHandler,
  FieldConfig,
  ReplaceOptions,
  RowEdit,
  RowValidation,
} from '@/lib/import-wizard/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchBar } from '../SearchBar';
import { FindReplaceDialog } from '../FindReplaceDialog';
import { AiEditChat } from '../AiEditChat';
import { UndoRedoButtons } from './UndoRedoButtons';
import { ExportMenu } from './ExportMenu';

interface ReviewToolbarProps<TRecord, TKey extends string> {
  rows: RowValidation<TRecord>[];
  fields: FieldConfig<TKey>[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchMatchCount: number;
  onReplace: (find: string, replace: string, options: ReplaceOptions) => number;
  countReplaceMatches: (find: string, options: ReplaceOptions) => number;
  /** Host App AI endpoint; AI Edit is hidden without it */
  aiEdit?: AiEditHandler;
  onApplyEdits: (edits: RowEdit[]) => void;
  /** Whether any included row still has errors */
  hasErrors: boolean;
  onExcludeInvalid: () => void;
  onFillEmptyRequired: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** Search, bulk edits, undo/redo and export for the review step */
export function ReviewToolbar<TRecord, TKey extends string>({
  rows,
  fields,
  searchQuery,
  onSearchChange,
  searchMatchCount,
  onReplace,
  countReplaceMatches,
  aiEdit,
  onApplyEdits,
  hasErrors,
  onExcludeInvalid,
  onFillEmptyRequired,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: ReviewToolbarProps<TRecord, TKey>) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between relative">
      <div className="flex items-center gap-2 flex-1">
        <SearchBar
          value={searchQuery}
          onChange={onSearchChange}
          matchCount={searchQuery ? searchMatchCount : undefined}
          className="flex-1 max-w-sm"
        />
        <FindReplaceDialog onReplace={onReplace} getPreviewCount={countReplaceMatches} fields={fields} />
        {aiEdit && (
          <AiEditChat rows={rows} fields={fields} onRequestEdits={aiEdit} onApplyEdits={onApplyEdits} />
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Exclude every row that still has errors */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onExcludeInvalid}
              disabled={!hasErrors}
              className="gap-1.5"
            >
              <Ban className="h-4 w-4" />
              Exclude Errors
            </Button>
          </TooltipTrigger>
          <TooltipContent>Leave every row that still has errors out of the import</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onFillEmptyRequired}
              disabled={!hasErrors}
              className="gap-1.5"
            >
              <ListChecks className="h-4 w-4" />
              Fill Required
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fill empty required fields with placeholder values</TooltipContent>
        </Tooltip>

        <UndoRedoButtons onUndo={onUndo} onRedo={onRedo} canUndo={canUndo} canRedo={canRedo} />
        <ExportMenu rows={rows} fields={fields} />
      </div>
    </div>
  );
}
