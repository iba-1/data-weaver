import React, { useState, useCallback } from 'react';
import { Replace, Search, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TARGET_FIELDS, type TargetField } from '@/lib/import-wizard/types';

interface FindReplaceDialogProps {
  onReplace: (find: string, replace: string, options: ReplaceOptions) => number;
  getPreviewCount: (find: string, options: ReplaceOptions) => number;
}

export interface ReplaceOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  selectedColumn: TargetField | 'all';
}

export function FindReplaceDialog({ onReplace, getPreviewCount }: FindReplaceDialogProps) {
  const [open, setOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<TargetField | 'all'>('all');
  const [lastReplaceCount, setLastReplaceCount] = useState<number | null>(null);

  const options: ReplaceOptions = {
    caseSensitive,
    wholeWord,
    selectedColumn,
  };

  const previewCount = findText ? getPreviewCount(findText, options) : 0;

  const handleReplace = useCallback(() => {
    if (!findText) return;
    const count = onReplace(findText, replaceText, options);
    setLastReplaceCount(count);
    
    // Clear after successful replace
    if (count > 0) {
      setFindText('');
      setReplaceText('');
      setTimeout(() => setLastReplaceCount(null), 3000);
    }
  }, [findText, replaceText, options, onReplace]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey && findText) {
      handleReplace();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Replace className="h-4 w-4" />
          Find & Replace
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Replace className="h-5 w-5" />
            Find and Replace
          </DialogTitle>
          <DialogDescription>
            Search and replace text across all data cells. Use Ctrl+Enter to replace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Find input */}
          <div className="space-y-2">
            <Label htmlFor="find">Find</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="find"
                value={findText}
                onChange={(e) => {
                  setFindText(e.target.value);
                  setLastReplaceCount(null);
                }}
                placeholder="Text to find..."
                className="pl-9"
                autoFocus
              />
            </div>
          </div>

          {/* Replace input */}
          <div className="space-y-2">
            <Label htmlFor="replace">Replace with</Label>
            <Input
              id="replace"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replacement text (leave empty to delete)"
            />
          </div>

          {/* Column filter */}
          <div className="space-y-2">
            <Label>In column</Label>
            <Select value={selectedColumn} onValueChange={(v) => setSelectedColumn(v as TargetField | 'all')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All columns</SelectItem>
                {TARGET_FIELDS.map((field) => (
                  <SelectItem key={field.key} value={field.key}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Options */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="caseSensitive"
                checked={caseSensitive}
                onCheckedChange={(checked) => setCaseSensitive(checked === true)}
              />
              <Label htmlFor="caseSensitive" className="text-sm font-normal cursor-pointer">
                Case sensitive
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="wholeWord"
                checked={wholeWord}
                onCheckedChange={(checked) => setWholeWord(checked === true)}
              />
              <Label htmlFor="wholeWord" className="text-sm font-normal cursor-pointer">
                Whole word
              </Label>
            </div>
          </div>

          {/* Preview */}
          {findText && (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              {previewCount > 0 ? (
                <>
                  <Badge variant="secondary">{previewCount}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {previewCount === 1 ? 'cell' : 'cells'} will be updated
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">No matches found</span>
                </>
              )}
            </div>
          )}

          {/* Success message */}
          {lastReplaceCount !== null && lastReplaceCount > 0 && (
            <div className="flex items-center gap-2 p-3 bg-success/10 text-success rounded-lg">
              <span className="text-sm font-medium">
                ✓ Replaced {lastReplaceCount} {lastReplaceCount === 1 ? 'cell' : 'cells'}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={handleReplace} disabled={!findText || previewCount === 0}>
            Replace All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
