import React, { useCallback, useState } from 'react';
import { Upload, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  checkUpload,
  DEFAULT_ACCEPTED_FILE_TYPES,
  DEFAULT_MAX_FILE_SIZE,
  formatFileSize,
  normaliseFileTypes,
} from '@/lib/import-wizard/parser';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TARGET_FIELDS, type FieldConfig } from '@/lib/import-wizard/types';
import { WizardRoot } from './WizardRoot';
import { useMessages } from './messages';

interface FileUploaderProps {
  /** Called with a file that passed the type and size checks */
  onFileSelected: (file: File) => void;
  isLoading?: boolean;
  error?: string | null;
  /** Plain text shown in the info banner above the drop zone; defaults to the catalogue's `upload.helpText` */
  helpText?: string;
  /** Fields shown as the expected columns in the preview; defaults to the artwork fields */
  fields?: Pick<FieldConfig, 'key' | 'label'>[];
  /** Accepted extensions (subset of .csv, .xlsx, .xls); other files are refused with a message */
  acceptedFileTypes?: string[];
  /** Maximum file size in bytes; larger files are refused with a message */
  maxFileSize?: number;
  className?: string;
}

/** Upload step: drop or pick a spreadsheet */
export function FileUploader(props: FileUploaderProps) {
  return (
    <WizardRoot>
      <FileUploaderContent {...props} />
    </WizardRoot>
  );
}

function FileUploaderContent({
  onFileSelected,
  isLoading = false,
  error = null,
  helpText,
  fields = TARGET_FIELDS,
  acceptedFileTypes = DEFAULT_ACCEPTED_FILE_TYPES,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  className,
}: FileUploaderProps) {
  const m = useMessages();
  const [isDragActive, setIsDragActive] = useState(false);
  // The file just refused; its message is worded at render, in the current catalogue
  const [refusedFile, setRefusedFile] = useState<File | null>(null);
  const acceptedTypes = normaliseFileTypes(acceptedFileTypes);
  const rules = { acceptedFileTypes, maxFileSize };

  const selectFile = useCallback(
    (file: File) => {
      const refused = checkUpload(file, { acceptedFileTypes, maxFileSize }) !== null;
      setRefusedFile(refused ? file : null);
      if (!refused) onFileSelected(file);
    },
    [acceptedFileTypes, maxFileSize, onFileSelected]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
    setRefusedFile(null);
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

      selectFile(files[0]);
    },
    [selectFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      selectFile(files[0]);
      // Let the Importer pick the same file again after fixing it
      e.target.value = '';
    },
    [selectFile]
  );

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <Skeleton className="h-12 w-full rounded-lg" />
        <div className="rounded-xl border-2 border-dashed p-8">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>
    );
  }

  // A refusal of the file just picked outranks an error left from an earlier one
  const refusal = refusedFile && checkUpload(refusedFile, rules, m);
  const displayError = refusal || error;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg bg-[hsl(var(--info-bg))] px-4 py-3 text-[hsl(var(--info-foreground))]">
        <Info className="h-5 w-5 mt-0.5 flex-shrink-0" />
        <p className="text-sm">{helpText ?? m.upload.helpText()}</p>
      </div>

      {/* Drop zone with skeleton table background */}
      <div
        className={cn(
          'relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden',
          'bg-[hsl(var(--dropzone-bg))] border-[hsl(var(--dropzone-border))]',
          isDragActive && 'bg-[hsl(var(--dropzone-active))] border-[hsl(var(--step-active))] scale-[1.01]',
          !isDragActive && 'hover:bg-[hsl(var(--dropzone-hover))] hover:border-[hsl(var(--step-active))]',
          displayError && 'border-destructive'
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
          accept={acceptedTypes.join(',')}
          onChange={handleFileInput}
          className="hidden"
        />

        {/* Skeleton table preview */}
        <div className="pointer-events-none select-none px-6 pt-6 pb-2 opacity-40">
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {fields.map((field) => (
                    <th
                      key={field.key}
                      className="px-4 py-2 text-left font-medium text-muted-foreground"
                    >
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3].map((row) => (
                  <tr key={row} className="border-b last:border-0">
                    {fields.map((field) => (
                      <td key={field.key} className="px-4 py-2">
                        <Skeleton className="h-4 w-16" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Drop zone content */}
        <div className="relative flex flex-col items-center gap-4 px-8 pb-10 pt-4 text-center">
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">
              {isDragActive ? m.upload.dropHere() : m.upload.dragAndDrop()}
            </h3>
            <p className="text-sm text-muted-foreground">
              {m.upload.accepted({
                types: acceptedTypes.join(', '),
                maxSize: formatFileSize(maxFileSize),
                maxBytes: maxFileSize,
              })}
            </p>
          </div>

          <Button
            type="button"
            size="lg"
            className="bg-[hsl(var(--step-active))] hover:bg-[hsl(var(--step-active))]/90 text-white"
            onClick={(e) => {
              e.stopPropagation();
              document.getElementById('file-input')?.click();
            }}
          >
            {m.upload.chooseFile()}
          </Button>

          {displayError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {displayError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
