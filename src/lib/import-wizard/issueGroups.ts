import type { RowEdit, RowValidation, ValidationError, ValidationWarning } from './types';
import type { ValidationMessageRef } from './messages';
import { cellText } from './values';

/** Errors block the import; warnings don't */
export type IssueKind = 'error' | 'warning';

type Issue = ValidationError | ValidationWarning;

/**
 * Why a cell has an issue, independent of its value and of the language: the
 * catalogue key for issues Data Weaver raises, the message itself for the Host
 * App's own (a Host App rule says the same thing on every row it applies to).
 */
export function issueCause(issue: Issue): string {
  if (!issue.messageRef) return `host:${issue.message}`;
  // The long and short "not an option" messages are one cause
  return issue.messageRef.key === 'notAnOptionAndMore' ? 'notAnOption' : issue.messageRef.key;
}

/** One distinct value, as the cell now reads, and the rows that hold it */
export interface IssueGroupValue {
  text: string;
  rowIndexes: number[];
}

/**
 * Every included row with the same kind of issue on the same field for the
 * same cause. Grouping never depends on the value or on the message's wording,
 * so 8 rows with "metri" and "centimetri" in Unità di misura are one group.
 */
export interface IssueGroup {
  id: string;
  kind: IssueKind;
  field: string;
  cause: string;
  /** The first issue's catalogue reference, when Data Weaver raised it */
  messageRef?: ValidationMessageRef;
  /** The first issue's message as written (the Host App's text for its own rules) */
  message: string;
  /** Rows with this issue, in file order */
  rowIndexes: number[];
  /** The distinct values those cells hold, by first appearance */
  values: IssueGroupValue[];
}

export function issueGroupId(kind: IssueKind, field: string, cause: string): string {
  return `${kind}\u0000${field}\u0000${cause}`;
}

function issuesOf<TRecord>(row: RowValidation<TRecord>, kind: IssueKind): Issue[] {
  return kind === 'error' ? row.errors : row.warnings;
}

/** Whether a row still has an issue of this group's kind, field and cause */
export function rowHasIssue<TRecord>(
  row: RowValidation<TRecord>,
  group: Pick<IssueGroup, 'kind' | 'field' | 'cause'>
): boolean {
  if (row.excluded) return false;
  return issuesOf(row, group.kind).some((issue) => issue.field === group.field && issueCause(issue) === group.cause);
}

/**
 * The issues of one kind across the included rows, grouped by field and cause.
 * Groups touching more rows come first; ties keep the order fields first fail.
 */
export function groupIssues<TRecord>(rows: RowValidation<TRecord>[], kind: IssueKind): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const row of rows) {
    if (row.excluded) continue;
    const data = row.data as Record<string, unknown>;
    // A row counts once per group, even with the same issue twice
    const seen = new Set<string>();
    for (const issue of issuesOf(row, kind)) {
      const cause = issueCause(issue);
      const id = issueGroupId(kind, issue.field, cause);
      if (seen.has(id)) continue;
      seen.add(id);
      let group = groups.get(id);
      if (!group) {
        group = { id, kind, field: issue.field, cause, messageRef: issue.messageRef, message: issue.message, rowIndexes: [], values: [] };
        groups.set(id, group);
      }
      group.rowIndexes.push(row.rowIndex);
      const text = cellText(data[issue.field]);
      const value = group.values.find((v) => v.text === text);
      if (value) value.rowIndexes.push(row.rowIndex);
      else group.values.push({ text, rowIndexes: [row.rowIndex] });
    }
  }
  return [...groups.values()].sort((a, b) => b.rowIndexes.length - a.rowIndexes.length);
}

/** Included rows that can't be imported: each counts once, however many errors it has */
export function blockedRowCount<TRecord>(rows: RowValidation<TRecord>[]): number {
  return rows.filter((row) => !row.excluded && !row.isValid).length;
}

/**
 * The edits that replace one value in one group: only included rows that
 * still have the group's issue and still hold exactly `text` in its field.
 * Other fields, excluded rows and rows already fixed are left alone.
 */
export function replacementEdits<TRecord>(
  rows: RowValidation<TRecord>[],
  group: Pick<IssueGroup, 'kind' | 'field' | 'cause'>,
  text: string,
  replacement: string
): RowEdit[] {
  return rows
    .filter(
      (row) =>
        rowHasIssue(row, group) && cellText((row.data as Record<string, unknown>)[group.field]) === text
    )
    .map((row) => ({ rowIndex: row.rowIndex, changes: { [group.field]: replacement } }));
}

/**
 * The digits of a cell that should have been a number, as an example of what
 * to write (`circa 1800` → `1800`). Only an example: the Importer decides.
 */
export function numberExample(text: string): string | null {
  const match = text.match(/\d+(?:[.,]\d+)*/);
  return match ? match[0] : null;
}
