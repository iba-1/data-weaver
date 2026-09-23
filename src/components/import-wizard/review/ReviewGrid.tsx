import type { FieldConfig, RowValidation } from '@/lib/import-wizard/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ReviewRow } from './ReviewRow';

interface ReviewGridProps<TRecord, TKey extends string> {
  /** The rows to show (already filtered, searched and paged) */
  rows: RowValidation<TRecord>[];
  fields: FieldConfig<TKey>[];
  requiredKeys: TKey[];
  searchQuery: string;
  onCellEdit: (rowIndex: number, fieldKey: TKey, newValue: string) => void;
  onToggleExcluded: (rowIndex: number, excluded: boolean) => void;
}

/** The review table: one column per field, required fields starred */
export function ReviewGrid<TRecord, TKey extends string>({
  rows,
  fields,
  requiredKeys,
  searchQuery,
  onCellEdit,
  onToggleExcluded,
}: ReviewGridProps<TRecord, TKey>) {
  return (
    <div className="rounded-lg border overflow-x-auto max-h-[400px] overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <TableHead className="w-20">#</TableHead>
            <TableHead className="w-12">Status</TableHead>
            {fields.map((field) => (
              <TableHead key={field.key} className="min-w-[140px]">
                {field.label}
                {requiredKeys.includes(field.key) && <span className="text-destructive ml-1">*</span>}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={fields.length + 2} className="text-center text-muted-foreground py-8">
                {searchQuery ? 'No rows match your search' : 'No rows match the current filter'}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <ReviewRow
                key={row.rowIndex}
                row={row}
                fields={fields}
                onCellEdit={onCellEdit}
                onToggleExcluded={onToggleExcluded}
                searchQuery={searchQuery}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
