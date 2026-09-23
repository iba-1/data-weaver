import { useId, type ReactNode } from 'react';
import { Ban, CheckCircle, XCircle } from 'lucide-react';
import type { FieldConfig, ImportReport, ImportRow } from '@/lib/import-wizard/types';
import { cellText } from '@/lib/import-wizard/values';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useMessages } from '../messages';

interface ImportReportViewProps<TRecord> {
  report: ImportReport<TRecord>;
  fields: Pick<FieldConfig, 'key' | 'label'>[];
  /** What the Importer can do next (e.g. download, Fix & Retry), shown below the lists */
  actions?: ReactNode;
}

/**
 * The Import Report: imported / rejected / excluded counts, the Rejected Rows
 * with the Host App's reasons, and the Excluded Rows as a separate list.
 */
export function ImportReportView<TRecord>({ report, fields, actions }: ImportReportViewProps<TRecord>) {
  const m = useMessages();
  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  // The first field identifies a row at a glance (e.g. its title)
  const identifying = fields[0];
  const identify = (row: ImportRow<TRecord>) =>
    identifying ? cellText((row.record as Record<string, unknown>)[identifying.key]) : '';

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-foreground">{m.report.title()}</h3>
        <ul className="flex flex-wrap gap-2">
          <Count icon={CheckCircle} className="border-success/40 text-success">
            {m.report.created({ count: report.created.length })}
          </Count>
          <Count
            icon={XCircle}
            className={report.rejected.length > 0 ? 'border-destructive/40 text-destructive' : 'text-muted-foreground'}
          >
            {m.report.rejected({ count: report.rejected.length })}
          </Count>
          <Count icon={Ban} className="text-muted-foreground">
            {m.report.excluded({ count: report.excluded.length })}
          </Count>
        </ul>
      </div>

      {report.rejected.length > 0 && (
        <ReportSection title={m.report.rejectedTitle()} description={m.report.rejectedDescription()}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{m.report.rowHeader()}</TableHead>
              {identifying && <TableHead>{identifying.label}</TableHead>}
              <TableHead>{m.report.fieldHeader()}</TableHead>
              <TableHead>{m.report.reasonHeader()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rejected.map((row) => (
              <TableRow key={row.importKey}>
                <TableCell className="font-mono text-muted-foreground">{row.rowIndex + 1}</TableCell>
                {identifying && <TableCell>{identify(row)}</TableCell>}
                <TableCell>{row.field ? labelOf(row.field) : ''}</TableCell>
                <TableCell className="text-destructive">{row.reason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </ReportSection>
      )}

      {report.excluded.length > 0 && (
        <ReportSection title={m.report.excludedTitle()} description={m.report.excludedDescription()}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{m.report.rowHeader()}</TableHead>
              {identifying && <TableHead>{identifying.label}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.excluded.map((row) => (
              <TableRow key={row.importKey}>
                <TableCell className="font-mono text-muted-foreground">{row.rowIndex + 1}</TableCell>
                {identifying && <TableCell>{identify(row)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </ReportSection>
      )}

      {actions}
    </div>
  );
}

function Count({
  icon: Icon,
  className,
  children,
}: {
  icon: typeof CheckCircle;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium', className)}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </li>
  );
}

/** A titled list of report rows, scrolling when long */
function ReportSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="space-y-2">
      <div>
        <h4 id={titleId} className="font-medium text-foreground">
          {title}
        </h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="max-h-80 overflow-auto rounded-lg border">
        <Table>{children}</Table>
      </div>
    </section>
  );
}
