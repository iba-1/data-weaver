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
import { useMessages } from '../messages';

interface ExportMenuProps<TRecord, TKey extends string> {
  rows: RowValidation<TRecord>[];
  fields: FieldConfig<TKey>[];
}

/** Download the rows under review as CSV or Excel */
export function ExportMenu<TRecord, TKey extends string>({ rows, fields }: ExportMenuProps<TRecord, TKey>) {
  const m = useMessages();
  const download = (format: 'csv' | 'xlsx', onlyValid = false) =>
    exportData(rows, fields, {
      format,
      onlyValid,
      filename: onlyValid ? m.export.validFileName() : m.export.fileName(),
      sheetName: m.export.sheetName(),
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          {m.export.menu()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover">
        <DropdownMenuItem onClick={() => download('csv')}>{m.export.csv()}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => download('xlsx')}>{m.export.excel()}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => download('xlsx', true)}>{m.export.validOnly()}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
