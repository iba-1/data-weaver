import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { AiEditHandler, FieldConfig, RowEdit, RowValidation } from '@/lib/import-wizard/types';
import { choiceOptions } from '@/lib/import-wizard/choices';
import { cellText } from '@/lib/import-wizard/values';
import { useMessages } from './messages';

interface AiEditChatProps<TRecord = Record<string, unknown>, TKey extends string = string> {
  rows: RowValidation<TRecord>[];
  fields: FieldConfig<TKey>[];
  /** Host App-supplied AI endpoint */
  onRequestEdits: AiEditHandler;
  onApplyEdits: (edits: RowEdit[]) => void;
  className?: string;
}

type ChatStatus = 'idle' | 'loading' | 'success' | 'error';

export function AiEditChat<TRecord = Record<string, unknown>, TKey extends string = string>({
  rows,
  fields,
  onRequestEdits,
  onApplyEdits,
  className,
}: AiEditChatProps<TRecord, TKey>) {
  const m = useMessages();
  const [isOpen, setIsOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pendingEdits, setPendingEdits] = useState<RowEdit[] | null>(null);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    if (!command.trim() || status === 'loading') return;

    setStatus('loading');
    setError(null);
    setPendingEdits(null);
    setLastCommand(command);

    try {
      const edits = await onRequestEdits({
        command: command.trim(),
        // Excluded Rows are out of the import, so they are not edited
        rows: rows
          .filter((row) => !row.excluded)
          .map((row) => ({ rowIndex: row.rowIndex, data: row.data as Record<string, unknown> })),
        fields: fields.map((f) => {
          const options = f.type === 'choice' ? choiceOptions(f) : undefined;
          return options ? { key: f.key, label: f.label, type: f.type, options } : { key: f.key, label: f.label, type: f.type };
        }),
      });

      setStatus('success');
      setPendingEdits(edits ?? []);
      setCommand('');
    } catch (err) {
      setStatus('error');
      // The Host App's own message is shown as it is; the catalogue covers failures without one
      setError(err instanceof Error && err.message ? err.message : null);
    }
  }, [command, rows, fields, status, onRequestEdits]);

  const handleApply = useCallback(() => {
    if (pendingEdits && pendingEdits.length > 0) {
      onApplyEdits(pendingEdits);
      setPendingEdits(null);
      setStatus('idle');
      setLastCommand(null);
    }
  }, [pendingEdits, onApplyEdits]);

  const handleDismiss = useCallback(() => {
    setPendingEdits(null);
    setStatus('idle');
    setError(null);
    setLastCommand(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    },
    [handleSubmit]
  );

  const exampleCommands = m.aiEdit
    .examples()
    .split('\n')
    .map((example) => example.trim())
    .filter(Boolean);
  const fieldLabel = (key: string) => fields.find((f) => f.key === key)?.label ?? key;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <Button
          variant={isOpen ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'gap-2 transition-all',
            isOpen && 'bg-primary text-primary-foreground'
          )}
        >
          <Sparkles className="h-4 w-4" />
          {m.aiEdit.open()}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="absolute left-0 right-0 mt-2 z-20">
        <div className="bg-card border rounded-lg shadow-lg p-4 space-y-3">
          {/* Input area */}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={m.aiEdit.placeholder()}
              disabled={status === 'loading'}
              className="flex-1"
            />
            <Button
              onClick={handleSubmit}
              disabled={!command.trim() || status === 'loading'}
              size="icon"
              aria-label={m.aiEdit.send()}
            >
              {status === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Example commands */}
          {status === 'idle' && !pendingEdits && exampleCommands.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">{m.aiEdit.examplesLabel()}</span>
              {exampleCommands.map((example) => (
                <Badge
                  key={example}
                  variant="secondary"
                  className="cursor-pointer text-xs hover:bg-secondary/80"
                  onClick={() => setCommand(example)}
                >
                  {example}
                </Badge>
              ))}
            </div>
          )}

          {/* Loading state */}
          {status === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {m.aiEdit.working()}
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error ?? m.aiEdit.failed()}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-auto"
                onClick={handleDismiss}
                aria-label={m.aiEdit.dismiss()}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Success with no changes */}
          {status === 'success' && pendingEdits && pendingEdits.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
              <CheckCircle className="h-4 w-4 text-success" />
              <span>{m.aiEdit.noChanges({ command: lastCommand ?? '' })}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-auto"
                onClick={handleDismiss}
                aria-label={m.aiEdit.dismiss()}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Pending edits preview */}
          {pendingEdits && pendingEdits.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium">{m.aiEdit.willEdit({ count: pendingEdits.length })}</span>
                </div>
                <span className="text-xs text-muted-foreground">{m.aiEdit.command({ command: lastCommand ?? '' })}</span>
              </div>

              {/* Preview of changes */}
              <div className="max-h-32 overflow-y-auto bg-muted/30 rounded p-2 text-xs font-mono space-y-1">
                {pendingEdits.slice(0, 5).map((edit) => (
                  <div key={edit.rowIndex} className="text-muted-foreground">
                    {m.aiEdit.previewRow({
                      row: edit.rowIndex + 1,
                      changes: Object.entries(edit.changes)
                        .map(([key, value]) => m.aiEdit.previewChange({ field: fieldLabel(key), value: cellText(value) }))
                        .join(', '),
                    })}
                  </div>
                ))}
                {pendingEdits.length > 5 && (
                  <div className="text-muted-foreground">{m.aiEdit.more({ count: pendingEdits.length - 5 })}</div>
                )}
              </div>

              {/* Apply/Cancel buttons */}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={handleDismiss}>
                  {m.aiEdit.cancel()}
                </Button>
                <Button size="sm" onClick={handleApply}>
                  <CheckCircle className="mr-1 h-3 w-3" />
                  {m.aiEdit.apply()}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
