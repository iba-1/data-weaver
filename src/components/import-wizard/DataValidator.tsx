import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Redo2,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RowValidation, FieldConfig } from '@/lib/import-wizard/types';
import { getValidationSummary, revalidateRow } from '@/lib/import-wizard/validator';
import { exportData } from '@/lib/import-wizard/exporter';
import { useHistory } from '@/hooks/useHistory';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EditableCell } from './EditableCell';
import { SearchBar } from './SearchBar';
import { FindReplaceDialog, type ReplaceOptions } from './FindReplaceDialog';

interface DataValidatorProps<TRecord = Record<string, unknown>, TKey extends string = string> {
  validatedRows: RowValidation<TRecord>[];
  fields: FieldConfig<TKey>[];
  requiredFields?: TKey[];
  onComplete: () => void;
  onBack: () => void;
  onRowsChange?: (rows: RowValidation<TRecord>[]) => void;
  isLoading?: boolean;
  className?: string;
}

const ROWS_PER_PAGE = 10;

export function DataValidator<TRecord = Record<string, unknown>, TKey extends string = string>({
  validatedRows,
  fields,
  requiredFields = [],
  onComplete,
  onBack,
  onRowsChange,
  isLoading = false,
  className,
}: DataValidatorProps<TRecord, TKey>) {
  // Use history hook for undo/redo
  const {
    state: localRows,
    set: setLocalRows,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory<RowValidation<TRecord>[]>(validatedRows);

  const [currentPage, setCurrentPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'errors' | 'warnings'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const summary = getValidationSummary(localRows);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Sync with parent when rows change
  useEffect(() => {
    onRowsChange?.(localRows);
  }, [localRows, onRowsChange]);

  // Helper to check if a value matches search
  const matchesSearch = useCallback((value: unknown, query: string): boolean => {
    if (!query || value === null || value === undefined) return false;
    return String(value).toLowerCase().includes(query.toLowerCase());
  }, []);

  // Helper to check if a row has any matching cell
  const rowMatchesSearch = useCallback(
    (row: RowValidation<TRecord>, query: string): boolean => {
      if (!query) return true;
      const data = row.data as Record<string, unknown>;
      return fields.some((field) => matchesSearch(data[field.key], query));
    },
    [matchesSearch, fields]
  );

  // Count search matches
  const searchMatchCount = useMemo(() => {
    if (!searchQuery) return 0;
    let count = 0;
    localRows.forEach((row) => {
      const data = row.data as Record<string, unknown>;
      fields.forEach((field) => {
        if (matchesSearch(data[field.key], searchQuery)) count++;
      });
    });
    return count;
  }, [localRows, searchQuery, matchesSearch, fields]);

  // Find and replace helpers
  const getMatchingValue = useCallback(
    (value: string, find: string, options: ReplaceOptions): boolean => {
      if (!value || !find) return false;
      const searchIn = options.caseSensitive ? value : value.toLowerCase();
      const searchFor = options.caseSensitive ? find : find.toLowerCase();

      if (options.wholeWord) {
        const regex = new RegExp(
          `\\b${searchFor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          options.caseSensitive ? '' : 'i'
        );
        return regex.test(value);
      }

      return searchIn.includes(searchFor);
    },
    []
  );

  const getPreviewCount = useCallback(
    (find: string, options: ReplaceOptions): number => {
      let count = 0;
      localRows.forEach((row) => {
        const data = row.data as Record<string, unknown>;
        fields.forEach((field) => {
          if (options.selectedColumn !== 'all' && options.selectedColumn !== field.key) return;
          const value = data[field.key];
          if (value !== null && value !== undefined && getMatchingValue(String(value), find, options)) {
            count++;
          }
        });
      });
      return count;
    },
    [localRows, getMatchingValue, fields]
  );

  const handleFindReplace = useCallback(
    (find: string, replace: string, options: ReplaceOptions): number => {
      let replacedCount = 0;

      const updatedRows = localRows.map((row) => {
        let modified = false;
        const updatedData = { ...(row.data as Record<string, unknown>) };

        fields.forEach((field) => {
          if (options.selectedColumn !== 'all' && options.selectedColumn !== field.key) return;

          const value = updatedData[field.key];
          if (value === null || value === undefined) return;

          const strValue = String(value);
          if (!getMatchingValue(strValue, find, options)) return;

          let newValue: string;
          if (options.wholeWord) {
            const regex = new RegExp(
              `\\b${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
              options.caseSensitive ? 'g' : 'gi'
            );
            newValue = strValue.replace(regex, replace);
          } else {
            const regex = new RegExp(
              find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              options.caseSensitive ? 'g' : 'gi'
            );
            newValue = strValue.replace(regex, replace);
          }

          if (newValue !== strValue) {
            if (field.type === 'number') {
              const cleaned = newValue.replace(/[,$€£¥\s]/g, '');
              const parsed = parseFloat(cleaned);
              updatedData[field.key] = isNaN(parsed) ? null : parsed;
            } else {
              updatedData[field.key] = newValue || null;
            }
            modified = true;
            replacedCount++;
          }
        });

        if (modified) {
          return revalidateRow({ ...row, data: updatedData as TRecord }, { fields, requiredFields });
        }
        return row;
      });

      setLocalRows(updatedRows);
      return replacedCount;
    },
    [localRows, fields, requiredFields, getMatchingValue, setLocalRows]
  );

  const handleCellEdit = useCallback(
    (rowIndex: number, fieldKey: TKey, newValue: string) => {
      setLocalRows((prevRows) => {
        return prevRows.map((row) => {
          if (row.rowIndex !== rowIndex) return row;

          const field = fields.find((f) => f.key === fieldKey);
          const updatedData = { ...(row.data as Record<string, unknown>) };

          if (field?.type === 'number') {
            const cleaned = newValue.replace(/[,$€£¥\s]/g, '');
            const parsed = parseFloat(cleaned);
            updatedData[fieldKey] = isNaN(parsed) ? null : parsed;
          } else {
            updatedData[fieldKey] = newValue || null;
          }

          return revalidateRow({ ...row, data: updatedData as TRecord }, { fields, requiredFields });
        });
      });
    },
    [fields, requiredFields, setLocalRows]
  );

  // Export handlers
  const handleExportCSV = useCallback(() => {
    exportData(localRows, fields, { format: 'csv', filename: 'data-export' });
  }, [localRows, fields]);

  const handleExportExcel = useCallback(() => {
    exportData(localRows, fields, { format: 'xlsx', filename: 'data-export' });
  }, [localRows, fields]);

  const handleExportValidOnly = useCallback(() => {
    exportData(localRows, fields, { format: 'xlsx', filename: 'data-export-valid', onlyValid: true });
  }, [localRows, fields]);

  // Filter and search
  const filteredRows = useMemo(() => {
    return localRows.filter((row) => {
      if (filter === 'errors' && row.isValid) return false;
      if (filter === 'warnings' && (!row.isValid || row.warnings.length === 0)) return false;
      if (searchQuery && !rowMatchesSearch(row, searchQuery)) return false;
      return true;
    });
  }, [localRows, filter, searchQuery, rowMatchesSearch]);

  const totalPages = Math.ceil(filteredRows.length / ROWS_PER_PAGE);
  const paginatedRows = filteredRows.slice(
    currentPage * ROWS_PER_PAGE,
    (currentPage + 1) * ROWS_PER_PAGE
  );

  // Sync local rows with prop changes (only on initial load)
  useEffect(() => {
    // This is handled by the useHistory hook initialization
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [filter, searchQuery]);

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
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Validate Data</h3>
            <p className="text-sm text-muted-foreground">
              Review, search, and fix data before importing
            </p>
          </div>

          {/* Summary badges */}
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={filter === 'all' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFilter('all')}
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
              onClick={() => setFilter('warnings')}
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
              onClick={() => setFilter('errors')}
            >
              <AlertCircle className="mr-1 h-3 w-3" />
              {summary.withErrors} Errors
            </Badge>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-1">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              matchCount={searchQuery ? searchMatchCount : undefined}
              className="flex-1 max-w-sm"
            />
            <FindReplaceDialog onReplace={handleFindReplace} getPreviewCount={getPreviewCount} fields={fields} />
          </div>

          {/* Undo/Redo & Export */}
          <div className="flex items-center gap-2">
            {/* Undo/Redo buttons */}
            <div className="flex items-center border rounded-md">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={undo}
                    disabled={!canUndo}
                    className="h-8 px-2 rounded-r-none border-r"
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={redo}
                    disabled={!canRedo}
                    className="h-8 px-2 rounded-l-none"
                  >
                    <Redo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
              </Tooltip>
            </div>

            {/* Export dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuItem onClick={handleExportCSV}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}>
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportValidOnly}>
                  Export valid rows only (Excel)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Data table */}
      <div className="rounded-lg border overflow-x-auto max-h-[400px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead className="w-12">Status</TableHead>
              {fields.map((field) => (
                <TableHead key={field.key} className="min-w-[140px]">
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
                  colSpan={fields.length + 2}
                  className="text-center text-muted-foreground py-8"
                >
                  {searchQuery ? 'No rows match your search' : 'No rows match the current filter'}
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row) => (
                <ValidationRow
                  key={row.rowIndex}
                  row={row}
                  fields={fields}
                  onCellEdit={handleCellEdit}
                  searchQuery={searchQuery}
                />
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
          <Button onClick={onComplete} disabled={summary.withErrors > 0} size="lg">
            <Download className="mr-2 h-4 w-4" />
            Complete Import ({summary.valid + summary.withWarnings} rows)
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ValidationRowProps<TRecord, TKey extends string> {
  row: RowValidation<TRecord>;
  fields: FieldConfig<TKey>[];
  onCellEdit: (rowIndex: number, fieldKey: TKey, newValue: string) => void;
  searchQuery: string;
}

function ValidationRow<TRecord, TKey extends string>({
  row,
  fields,
  onCellEdit,
  searchQuery,
}: ValidationRowProps<TRecord, TKey>) {
  const getRowClass = () => {
    if (!row.isValid) return 'validation-row-error';
    if (row.warnings.length > 0) return 'validation-row-warning';
    return '';
  };

  const getFieldError = (fieldKey: string) => row.errors.find((e) => e.field === fieldKey);
  const getFieldWarning = (fieldKey: string) => row.warnings.find((w) => w.field === fieldKey);

  const isHighlighted = (value: unknown): boolean => {
    if (!searchQuery || value === null || value === undefined) return false;
    return String(value).toLowerCase().includes(searchQuery.toLowerCase());
  };

  const data = row.data as Record<string, unknown>;

  return (
    <TableRow className={getRowClass()}>
      <TableCell className="font-mono text-xs text-muted-foreground">{row.rowIndex + 1}</TableCell>
      <TableCell>
        {!row.isValid ? (
          <Tooltip>
            <TooltipTrigger>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </TooltipTrigger>
            <TooltipContent>{row.errors.map((e) => e.message).join(', ')}</TooltipContent>
          </Tooltip>
        ) : row.warnings.length > 0 ? (
          <Tooltip>
            <TooltipTrigger>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </TooltipTrigger>
            <TooltipContent>{row.warnings.map((w) => w.message).join(', ')}</TooltipContent>
          </Tooltip>
        ) : (
          <Check className="h-4 w-4 text-success" />
        )}
      </TableCell>
      {fields.map((field) => {
        const value = data[field.key];
        const error = getFieldError(field.key);
        const warning = getFieldWarning(field.key);
        const highlighted = isHighlighted(value);

        return (
          <TableCell key={field.key}>
            <EditableCell
              value={value as string | number | null}
              onSave={(newValue) => onCellEdit(row.rowIndex, field.key, newValue)}
              hasError={!!error}
              hasWarning={!!warning}
              isHighlighted={highlighted}
            />
          </TableCell>
        );
      })}
    </TableRow>
  );
}
