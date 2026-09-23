import React, { useState, useCallback } from 'react';
import { Replace, Search, AlertTriangle, Check } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FieldConfig, ReplaceOptions } from '@/lib/import-wizard/types';
import { useMessages } from './messages';

interface FindReplaceDialogProps<TKey extends string = string> {
  onReplace: (find: string, replace: string, options: ReplaceOptions) => number;
  getPreviewCount: (find: string, options: ReplaceOptions) => number;
  fields?: FieldConfig<TKey>[];
}

// Default fields for backwards compatibility
const DEFAULT_FIELDS: FieldConfig[] = [
  { key: 'title', label: 'Title', type: 'string' },
  { key: 'artist', label: 'Artist', type: 'string' },
  { key: 'period', label: 'Period', type: 'string' },
  { key: 'technique', label: 'Technique', type: 'string' },
  { key: 'valueAmount', label: 'Value Amount', type: 'number' },
  { key: 'valueCurrency', label: 'Value Currency', type: 'string' },
];

export function FindReplaceDialog<TKey extends string = string>({ 
  onReplace, 
  getPreviewCount,
  fields = DEFAULT_FIELDS as FieldConfig<TKey>[],
}: FindReplaceDialogProps<TKey>) {
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<string>('all');
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
          {m.findReplace.open()}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown} closeLabel={m.findReplace.close()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Replace className="h-5 w-5" />
            {m.findReplace.title()}
          </DialogTitle>
          <DialogDescription>{m.findReplace.description()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Find input */}
          <div className="space-y-2">
            <Label htmlFor="find">{m.findReplace.find()}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="find"
                value={findText}
                onChange={(e) => {
                  setFindText(e.target.value);
                  setLastReplaceCount(null);
                }}
                placeholder={m.findReplace.findPlaceholder()}
                className="pl-9"
                autoFocus
              />
            </div>
          </div>

          {/* Replace input */}
          <div className="space-y-2">
            <Label htmlFor="replace">{m.findReplace.replace()}</Label>
            <Input
              id="replace"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder={m.findReplace.replacePlaceholder()}
            />
          </div>

          {/* Column filter */}
          <div className="space-y-2">
            <Label>{m.findReplace.column()}</Label>
            <Select value={selectedColumn} onValueChange={setSelectedColumn}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{m.findReplace.allColumns()}</SelectItem>
                {fields.map((field) => (
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
                {m.findReplace.caseSensitive()}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="wholeWord"
                checked={wholeWord}
                onCheckedChange={(checked) => setWholeWord(checked === true)}
              />
              <Label htmlFor="wholeWord" className="text-sm font-normal cursor-pointer">
                {m.findReplace.wholeWord()}
              </Label>
            </div>
          </div>

          {/* Preview */}
          {findText && (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              {previewCount > 0 ? (
                <span className="text-sm text-muted-foreground">{m.findReplace.willUpdate({ count: previewCount })}</span>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{m.findReplace.noMatches()}</span>
                </>
              )}
            </div>
          )}

          {/* Success message */}
          {lastReplaceCount !== null && lastReplaceCount > 0 && (
            <div className="flex items-center gap-2 p-3 bg-success/10 text-success rounded-lg">
              <Check className="h-4 w-4" />
              <span className="text-sm font-medium">{m.findReplace.replaced({ count: lastReplaceCount })}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {m.findReplace.close()}
          </Button>
          <Button onClick={handleReplace} disabled={!findText || previewCount === 0}>
            {m.findReplace.replaceAll()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
