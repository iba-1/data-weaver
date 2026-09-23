import { AlertCircle, AlertTriangle, Ban, Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FieldConfig, RowValidation } from '@/lib/import-wizard/types';
import { matchesSearch } from '@/lib/import-wizard/search';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EditableCell } from '../EditableCell';

interface ReviewRowProps<TRecord, TKey extends string> {
  row: RowValidation<TRecord>;
  fields: FieldConfig<TKey>[];
  onCellEdit: (rowIndex: number, fieldKey: TKey, newValue: string) => void;
  onToggleExcluded: (rowIndex: number, excluded: boolean) => void;
  searchQuery: string;
}

function rowClassName<TRecord>(row: RowValidation<TRecord>): string {
  if (row.excluded) return 'opacity-50';
  if (!row.isValid) return 'validation-row-error';
  if (row.warnings.length > 0) return 'validation-row-warning';
  return '';
}

/** One row of the review grid: exclude toggle, status and an editable cell per field */
export function ReviewRow<TRecord, TKey extends string>({
  row,
  fields,
  onCellEdit,
  onToggleExcluded,
  searchQuery,
}: ReviewRowProps<TRecord, TKey>) {
  const data = row.data as Record<string, unknown>;

  return (
    <TableRow className={rowClassName(row)}>
      <TableCell className="font-mono text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={`${row.excluded ? 'Include' : 'Exclude'} row ${row.rowIndex + 1}`}
                onClick={() => onToggleExcluded(row.rowIndex, !row.excluded)}
              >
                {row.excluded ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {row.excluded ? 'Include this row in the import again' : 'Leave this row out of the import'}
            </TooltipContent>
          </Tooltip>
          {row.rowIndex + 1}
        </div>
      </TableCell>
      <TableCell>
        <RowStatus row={row} />
      </TableCell>
      {fields.map((field) => {
        const value = data[field.key];
        const error = row.errors.find((e) => e.field === field.key);
        const warning = row.warnings.find((w) => w.field === field.key);

        return (
          <TableCell key={field.key}>
            <EditableCell
              value={value as string | number | null}
              onSave={(newValue) => onCellEdit(row.rowIndex, field.key, newValue)}
              hasError={!!error && !row.excluded}
              hasWarning={!!warning && !row.excluded}
              isHighlighted={matchesSearch(value, searchQuery)}
              className={cn(row.excluded && 'line-through')}
            />
          </TableCell>
        );
      })}
    </TableRow>
  );
}

function RowStatus<TRecord>({ row }: { row: RowValidation<TRecord> }) {
  if (row.excluded) {
    return <Ban className="h-4 w-4 text-muted-foreground" aria-label="Excluded" />;
  }
  if (!row.isValid) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <AlertCircle className="h-4 w-4 text-destructive" />
        </TooltipTrigger>
        <TooltipContent>{row.errors.map((e) => e.message).join(', ')}</TooltipContent>
      </Tooltip>
    );
  }
  if (row.warnings.length > 0) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <AlertTriangle className="h-4 w-4 text-warning" />
        </TooltipTrigger>
        <TooltipContent>{row.warnings.map((w) => w.message).join(', ')}</TooltipContent>
      </Tooltip>
    );
  }
  return <Check className="h-4 w-4 text-success" />;
}
