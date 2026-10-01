import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { FieldConfig, RowRejection, RowValidation } from '@/lib/import-wizard/types';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { REVIEW_ROW_HEIGHT, ReviewRow } from './ReviewRow';
import { useMessages } from '../messages';
import type { ResolvedValue } from '@/lib/import-wizard/resolution';

/** Rows rendered beyond each edge of the viewport, so fast scrolls and Tab stay smooth */
const OVERSCAN = 10;

interface ReviewGridProps<TRecord, TKey extends string> {
  /** The rows to show (already filtered and searched) */
  rows: RowValidation<TRecord>[];
  fields: FieldConfig<TKey>[];
  requiredKeys: TKey[];
  searchQuery: string;
  /** The grid scrolls back to the top whenever this changes (e.g. a new filter or search) */
  scrollResetKey: string;
  onCellEdit: (rowIndex: number, fieldKey: TKey, newValue: string) => void;
  onToggleExcluded: (rowIndex: number, excluded: boolean) => void;
  /** Relationship Field values as last resolved: their cells show a badge naming the Related Record */
  relatedValues?: ReadonlyMap<string, ResolvedValue>;
  /** Fix & Retry: why the Host App refused each row, by rowIndex */
  rejections?: ReadonlyMap<number, RowRejection>;
}

/**
 * The review table: one column per field, required fields starred. It is
 * virtualised: only the rows in view (plus overscan) are in the DOM, with
 * spacer rows standing in for the rest, so 10k rows scroll like 10.
 */
export function ReviewGrid<TRecord, TKey extends string>({
  rows,
  fields,
  requiredKeys,
  searchQuery,
  scrollResetKey,
  onCellEdit,
  onToggleExcluded,
  relatedValues,
  rejections,
}: ReviewGridProps<TRecord, TKey>) {
  const m = useMessages();
  const viewportRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => REVIEW_ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  useEffect(() => {
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [scrollResetKey]);

  const items = virtualizer.getVirtualItems();
  const spaceAbove = items.length > 0 ? items[0].start : 0;
  const spaceBelow = items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
  const columnCount = fields.length + 2;

  return (
    <div
      ref={viewportRef}
      data-review-grid-viewport=""
      className="min-h-[240px] flex-1 overflow-auto rounded-lg border"
    >
      <table
        className="table-fixed caption-bottom text-sm"
        // Field columns share the width left after # and Status, never narrower than 180px:
        // with more columns than fit, the grid scrolls sideways like a spreadsheet
        style={{ width: '100%', minWidth: 96 + 260 + fields.length * 180 }}
        aria-rowcount={rows.length + 1}
      >
        <TableHeader className="sticky top-0 bg-background z-10 shadow-[inset_0_-1px_0_hsl(var(--border))]">
          <TableRow aria-rowindex={1} className="hover:bg-transparent">
            <TableHead className="sticky left-0 z-20 w-24 bg-background px-3">{m.review.rowNumberHeader()}</TableHead>
            <TableHead className="sticky left-24 z-20 w-[260px] whitespace-nowrap border-r bg-background px-3">
              {m.review.statusHeader()}
            </TableHead>
            {fields.map((field) => (
              <TableHead key={field.key} className="truncate whitespace-nowrap px-3" title={field.label}>
                {field.label}
                {requiredKeys.includes(field.key) && <span className="text-destructive ml-1">*</span>}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="text-center text-muted-foreground py-8">
                {searchQuery ? m.review.noSearchMatches() : m.review.noFilterMatches()}
              </TableCell>
            </TableRow>
          ) : (
            <>
              {spaceAbove > 0 && <SpacerRow height={spaceAbove} columnCount={columnCount} />}
              {items.map((item) => {
                const row = rows[item.index];
                return (
                  <ReviewRow
                    key={row.rowIndex}
                    row={row}
                    ariaRowIndex={item.index + 2}
                    fields={fields}
                    onCellEdit={onCellEdit}
                    onToggleExcluded={onToggleExcluded}
                    searchQuery={searchQuery}
                    relatedValues={relatedValues}
                    rejection={rejections?.get(row.rowIndex)}
                  />
                );
              })}
              {spaceBelow > 0 && <SpacerRow height={spaceBelow} columnCount={columnCount} />}
            </>
          )}
        </TableBody>
      </table>
    </div>
  );
}

/** Stands in for the rows scrolled out of view, so the scrollbar reflects every row */
function SpacerRow({ height, columnCount }: { height: number; columnCount: number }) {
  return (
    <tr aria-hidden="true">
      <td colSpan={columnCount} style={{ height, padding: 0, border: 0 }} />
    </tr>
  );
}
