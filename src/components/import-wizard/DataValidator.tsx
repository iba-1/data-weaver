import React, { useState, useCallback } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RowValidation, TargetField, ArtworkRecord } from '@/lib/import-wizard/types';
import { TARGET_FIELDS } from '@/lib/import-wizard/types';
import { getValidationSummary, revalidateRow } from '@/lib/import-wizard/validator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { EditableCell } from './EditableCell';

interface DataValidatorProps {
  validatedRows: RowValidation[];
  onComplete: () => void;
  onBack: () => void;
  onRowsChange?: (rows: RowValidation[]) => void;
  requiredFields?: TargetField[];
  isLoading?: boolean;
  className?: string;
}

const ROWS_PER_PAGE = 10;

export function DataValidator({
  validatedRows,
  onComplete,
  onBack,
  onRowsChange,
  requiredFields = ['title', 'artist'],
  isLoading = false,
  className,
}: DataValidatorProps) {
  const [localRows, setLocalRows] = useState<RowValidation[]>(validatedRows);
  const [currentPage, setCurrentPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'errors' | 'warnings'>('all');

  const summary = getValidationSummary(localRows);

  const handleCellEdit = useCallback(
    (rowIndex: number, field: TargetField, newValue: string) => {
      setLocalRows((prevRows) => {
        const updatedRows = prevRows.map((row) => {
          if (row.rowIndex !== rowIndex) return row;

          // Update the data
          const updatedData: ArtworkRecord = { ...row.data };
          if (field === 'valueAmount') {
            const cleaned = newValue.replace(/[,$€£¥\s]/g, '');
            const parsed = parseFloat(cleaned);
            updatedData.valueAmount = isNaN(parsed) ? null : parsed;
          } else {
            updatedData[field] = newValue || null;
          }

          // Revalidate the row
          const updatedRow = revalidateRow(
            { ...row, data: updatedData },
            requiredFields
          );

          return updatedRow;
        });

        // Notify parent of changes
        onRowsChange?.(updatedRows);

        return updatedRows;
      });
    },
    [requiredFields, onRowsChange]
  );

  const filteredRows = localRows.filter((row) => {
    if (filter === 'all') return true;
    if (filter === 'errors') return !row.isValid;
    if (filter === 'warnings') return row.isValid && row.warnings.length > 0;
    return true;
  });

  const totalPages = Math.ceil(filteredRows.length / ROWS_PER_PAGE);
  const paginatedRows = filteredRows.slice(
    currentPage * ROWS_PER_PAGE,
    (currentPage + 1) * ROWS_PER_PAGE
  );

  // Sync local rows with prop changes (when coming back from mapping)
  React.useEffect(() => {
    setLocalRows(validatedRows);
  }, [validatedRows]);

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Validate Data</h3>
          <p className="text-sm text-muted-foreground">
            Review your data before importing
          </p>
        </div>

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={filter === 'all' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => {
              setFilter('all');
              setCurrentPage(0);
            }}
          >
            <CheckCircle className="mr-1 h-3 w-3" />
            {summary.valid} Valid
          </Badge>
          <Badge
            variant={filter === 'warnings' ? 'default' : 'outline'}
            className={cn(
              'cursor-pointer',
              summary.withWarnings > 0 && filter !== 'warnings' && 'border-warning text-warning'
            )}
            onClick={() => {
              setFilter('warnings');
              setCurrentPage(0);
            }}
          >
            <AlertTriangle className="mr-1 h-3 w-3" />
            {summary.withWarnings} Warnings
          </Badge>
          <Badge
            variant={filter === 'errors' ? 'default' : 'outline'}
            className={cn(
              'cursor-pointer',
              summary.withErrors > 0 && filter !== 'errors' && 'border-destructive text-destructive'
            )}
            onClick={() => {
              setFilter('errors');
              setCurrentPage(0);
            }}
          >
            <AlertCircle className="mr-1 h-3 w-3" />
            {summary.withErrors} Errors
          </Badge>
        </div>
      </div>

      {/* Data table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead className="w-16">Status</TableHead>
              {TARGET_FIELDS.map((field) => (
                <TableHead key={field.key}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={TARGET_FIELDS.length + 2}
                  className="text-center text-muted-foreground py-8"
                >
                  No rows match the current filter
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row) => (
                <ValidationRow key={row.rowIndex} row={row} onCellEdit={handleCellEdit} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {currentPage * ROWS_PER_PAGE + 1}-
            {Math.min((currentPage + 1) * ROWS_PER_PAGE, filteredRows.length)} of{' '}
            {filteredRows.length} rows
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage === totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Sticky Actions */}
      <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t pt-4 pb-2 -mx-1 px-1 z-10">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Mapping
          </Button>
          <Button
            onClick={onComplete}
            disabled={summary.withErrors > 0}
            size="lg"
          >
            <Download className="mr-2 h-4 w-4" />
            Complete Import ({summary.valid + summary.withWarnings} rows)
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ValidationRowProps {
  row: RowValidation;
  onCellEdit: (rowIndex: number, field: TargetField, newValue: string) => void;
}

function ValidationRow({ row, onCellEdit }: ValidationRowProps) {
  const getRowClass = () => {
    if (!row.isValid) return 'validation-row-error';
    if (row.warnings.length > 0) return 'validation-row-warning';
    return '';
  };

  const getFieldError = (field: TargetField) =>
    row.errors.find((e) => e.field === field);
  const getFieldWarning = (field: TargetField) =>
    row.warnings.find((w) => w.field === field);

  return (
    <TableRow className={getRowClass()}>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {row.rowIndex + 1}
      </TableCell>
      <TableCell>
        {!row.isValid ? (
          <Tooltip>
            <TooltipTrigger>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </TooltipTrigger>
            <TooltipContent>
              {row.errors.map((e) => e.message).join(', ')}
            </TooltipContent>
          </Tooltip>
        ) : row.warnings.length > 0 ? (
          <Tooltip>
            <TooltipTrigger>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </TooltipTrigger>
            <TooltipContent>
              {row.warnings.map((w) => w.message).join(', ')}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Check className="h-4 w-4 text-success" />
        )}
      </TableCell>
      {TARGET_FIELDS.map((field) => {
        const value = row.data[field.key];
        const error = getFieldError(field.key);
        const warning = getFieldWarning(field.key);

        return (
          <TableCell key={field.key}>
            <EditableCell
              value={value}
              onSave={(newValue) => onCellEdit(row.rowIndex, field.key, newValue)}
              hasError={!!error}
              hasWarning={!!warning}
            />
          </TableCell>
        );
      })}
    </TableRow>
  );
}
