import { FileSpreadsheet } from 'lucide-react';
import type { FieldConfig, RowValidation } from '@/lib/import-wizard/types';
import { exportData } from '@/lib/import-wizard/exporter';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ExportMenuProps<TRecord, TKey extends string> {
  rows: RowValidation<TRecord>[];
  fields: FieldConfig<TKey>[];
}

/** Download the rows under review as CSV or Excel */
export function ExportMenu<TRecord, TKey extends string>({ rows, fields }: ExportMenuProps<TRecord, TKey>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover">
        <DropdownMenuItem onClick={() => exportData(rows, fields, { format: 'csv', filename: 'data-export' })}>
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportData(rows, fields, { format: 'xlsx', filename: 'data-export' })}>
          Export as Excel
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            exportData(rows, fields, { format: 'xlsx', filename: 'data-export-valid', onlyValid: true })
          }
        >
          Export valid rows only (Excel)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
