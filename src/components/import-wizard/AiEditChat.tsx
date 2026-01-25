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
import { supabase } from '@/integrations/supabase/client';
import type { RowValidation, FieldConfig } from '@/lib/import-wizard/types';

interface AiEditChatProps<TRecord = Record<string, unknown>, TKey extends string = string> {
  rows: RowValidation<TRecord>[];
  fields: FieldConfig<TKey>[];
  onApplyEdits: (edits: Array<{ rowIndex: number; changes: Record<string, unknown> }>) => void;
  className?: string;
}

interface PendingEdit {
  rowIndex: number;
  changes: Record<string, unknown>;
}

type ChatStatus = 'idle' | 'loading' | 'success' | 'error';

export function AiEditChat<TRecord = Record<string, unknown>, TKey extends string = string>({
  rows,
  fields,
  onApplyEdits,
  className,
}: AiEditChatProps<TRecord, TKey>) {
  const [isOpen, setIsOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[] | null>(null);
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
      // Prepare row data for the API
      const rowData = rows.map((row) => ({
        rowIndex: row.rowIndex,
        data: row.data as Record<string, unknown>,
      }));

      const fieldData = fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
      }));

      console.log('Sending AI edit request:', { command, rowCount: rowData.length });

      const { data, error: fnError } = await supabase.functions.invoke('ai-edit-rows', {
        body: {
          command: command.trim(),
          rows: rowData,
          fields: fieldData,
        },
      });

      if (fnError) {
        console.error('Function invocation error:', fnError);
        throw new Error(fnError.message || 'Failed to process command');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const edits = data?.edits as PendingEdit[];
      
      if (!edits || edits.length === 0) {
        setStatus('success');
        setError('No changes needed for this command.');
        setPendingEdits([]);
      } else {
        setStatus('success');
        setPendingEdits(edits);
      }

      setCommand('');
    } catch (err) {
      console.error('AI edit error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  }, [command, rows, fields, status]);

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

  const exampleCommands = [
    'Capitalize all titles',
    'Trim whitespace from all fields',
    'Fix common spelling mistakes',
    'Standardize currency to USD',
  ];

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
          AI Edit
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
              placeholder="Describe how to edit the data..."
              disabled={status === 'loading'}
              className="flex-1"
            />
            <Button
              onClick={handleSubmit}
              disabled={!command.trim() || status === 'loading'}
              size="icon"
            >
              {status === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Example commands */}
          {status === 'idle' && !pendingEdits && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">Try:</span>
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
              Analyzing data and generating edits...
            </div>
          )}

          {/* Error state */}
          {status === 'error' && error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-auto"
                onClick={handleDismiss}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Success with no changes */}
          {status === 'success' && pendingEdits && pendingEdits.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
              <CheckCircle className="h-4 w-4 text-success" />
              <span>No changes needed for "{lastCommand}"</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-auto"
                onClick={handleDismiss}
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
                  <span className="text-sm font-medium">
                    {pendingEdits.length} row{pendingEdits.length !== 1 ? 's' : ''} will be edited
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">"{lastCommand}"</span>
              </div>

              {/* Preview of changes */}
              <div className="max-h-32 overflow-y-auto bg-muted/30 rounded p-2 text-xs font-mono space-y-1">
                {pendingEdits.slice(0, 5).map((edit) => (
                  <div key={edit.rowIndex} className="text-muted-foreground">
                    Row {edit.rowIndex + 1}:{' '}
                    {Object.entries(edit.changes)
                      .map(([key, value]) => `${key}="${value}"`)
                      .join(', ')}
                  </div>
                ))}
                {pendingEdits.length > 5 && (
                  <div className="text-muted-foreground">
                    ...and {pendingEdits.length - 5} more
                  </div>
                )}
              </div>

              {/* Apply/Cancel buttons */}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={handleDismiss}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleApply}>
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Apply Changes
                </Button>
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
