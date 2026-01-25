import React, { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, FileText, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isValidFileType, getFileTypeFromName } from '@/lib/import-wizard/parser';
import { Skeleton } from '@/components/ui/skeleton';

interface FileUploaderProps {
  onFileSelected: (file: File) => void;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

export function FileUploader({
  onFileSelected,
  isLoading = false,
  error = null,
  className,
}: FileUploaderProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
    setDragError(null);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const file = files[0];
      if (!isValidFileType(file.name)) {
        setDragError('Please upload a CSV, Excel, or PDF file');
        return;
      }

      setDragError(null);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!isValidFileType(file.name)) {
        setDragError('Please upload a CSV, Excel, or PDF file');
        return;
      }

      setDragError(null);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  if (isLoading) {
    return (
      <div className={cn('p-8', className)}>
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    );
  }

  const displayError = error || dragError;

  return (
    <div
      className={cn(
        'dropzone p-8 cursor-pointer',
        isDragActive && 'active',
        displayError && 'border-destructive',
        className
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept=".csv,.xlsx,.xls,.pdf"
        onChange={handleFileInput}
        className="hidden"
      />

      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full transition-colors',
            isDragActive
              ? 'bg-primary/20 text-primary'
              : 'bg-muted text-muted-foreground'
          )}
        >
          <Upload className="h-8 w-8" />
        </div>

        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">
            {isDragActive ? 'Drop your file here' : 'Upload your file'}
          </h3>
          <p className="text-sm text-muted-foreground">
            Drag and drop or click to browse
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileSpreadsheet className="h-4 w-4" />
            CSV, Excel
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            PDF
          </span>
        </div>

        {displayError && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {displayError}
          </div>
        )}
      </div>
    </div>
  );
}
