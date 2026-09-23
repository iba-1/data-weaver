import React, { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cellText } from '@/lib/import-wizard/values';

interface EditableCellProps {
  value: string | number | Date | null;
  onSave: (value: string) => void;
  hasError?: boolean;
  hasWarning?: boolean;
  isHighlighted?: boolean;
  className?: string;
}

export function EditableCell({
  value,
  onSave,
  hasError = false,
  hasWarning = false,
  isHighlighted = false,
  className,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditValue(cellText(value));
    setIsEditing(true);
  };

  const handleSave = () => {
    onSave(editValue.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Tab') {
      // Allow tab to save and move to next cell
      handleSave();
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Check if we're clicking the save/cancel buttons
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget?.closest('.editable-cell-actions')) {
      return;
    }
    // Auto-save on blur
    handleSave();
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 min-w-[120px]">
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="h-7 text-sm py-0 px-2 flex-1"
        />
        <div className="editable-cell-actions flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-success hover:text-success hover:bg-success/10"
            onClick={handleSave}
            tabIndex={-1}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleCancel}
            tabIndex={-1}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cellRef}
      className={cn(
        'cursor-text rounded px-2 py-1 -mx-1 min-h-[28px] transition-all',
        'hover:bg-muted/60 hover:ring-1 hover:ring-border',
        'focus:outline-none focus:ring-2 focus:ring-primary',
        hasError && 'text-destructive bg-destructive/5',
        hasWarning && !hasError && 'text-warning bg-warning/5',
        isHighlighted && 'bg-primary/20 ring-1 ring-primary/40',
        className
      )}
      onClick={handleStartEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          handleStartEdit();
        }
      }}
      tabIndex={0}
      role="gridcell"
    >
      {value !== null && value !== undefined ? (
        <span className="max-w-[180px] truncate block text-sm">{cellText(value)}</span>
      ) : (
        <span className="text-muted-foreground/60 italic text-sm">empty</span>
      )}
    </div>
  );
}
