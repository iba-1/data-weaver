/**
 * The first phase of a Commit with Relationship Fields, before any row is
 * saved: create the new Related Records chosen in Resolution, once each and
 * one at a time, then put Related Record IDs in place of names in the rows
 * (ADR-0001). The rows then go to `commitRows` like any other.
 */

import type { CreateRelated, FieldConfig, ImportRow, RejectedRow, RelatedRecordId } from './types';
import { ENGLISH_MESSAGES, type ResolvedMessages } from './messages';
import { normaliseForMatch } from './normalise';
import {
  decisionForRow,
  decisionsInEffect,
  relatedValueKey,
  relatedValueOf,
  relationshipKinds,
  type ResolvedValue,
} from './resolution';

/** A new Related Record to create at the start of Commit */
export interface RelatedCreation {
  kind: string;
  /** The stored name, as confirmed in Resolution */
  name: string;
  /** The values (`relatedValueKey`) some of whose rows will point to it */
  keys: string[];
}

/** A creation and its outcome: the new record's ID, or why it was not created */
export type CreatedRelated = RelatedCreation & ({ id: RelatedRecordId } | { reason: string });

/**
 * The new Related Records a Commit creates: one per value with rows decided
 * `create`, and one only for values whose names are a Normalised Match of
 * each other (e.g. the Importer gave `G. Rossi` the name `Galleria Rossi`).
 * A value used in several fields is one value, so it is created once. Kinds
 * never mix.
 *
 * With per-row decisions (Homonyms), only the decisions some row actually
 * gets count: every row of a value assigned to "create new" points to the
 * same one new record, whether by the value's decision or its own. A value
 * whose rows all link to existing records creates nothing.
 */
export function planRelatedCreations(resolved: ResolvedValue[]): RelatedCreation[] {
  const plan = new Map<string, RelatedCreation>();
  for (const value of resolved) {
    const key = relatedValueKey(value.kind, value.value);
    for (const decision of decisionsInEffect(value)) {
      if (decision?.action !== 'create') continue;
      const id = creationKey(value.kind, decision.name);
      const planned = plan.get(id);
      if (!planned) plan.set(id, { kind: value.kind, name: decision.name, keys: [key] });
      else if (!planned.keys.includes(key)) planned.keys.push(key);
    }
  }
  return [...plan.values()];
}

/**
 * A new Related Record's identity: its kind and the Normalised Match of its
 * name. Two creations with the same identity are the same record.
 */
export function creationKey(kind: string, name: string): string {
  return relatedValueKey(kind, normaliseForMatch(name));
}

/** The Related Records a Commit created, by `creationKey`, with their IDs; failures are left out */
export function createdRelatedIds(created: CreatedRelated[]): Map<string, RelatedRecordId> {
  const ids = new Map<string, RelatedRecordId>();
  for (const creation of created) if ('id' in creation) ids.set(creationKey(creation.kind, creation.name), creation.id);
  return ids;
}

/**
 * For Fix & Retry: values decided `create` whose record an earlier Commit
 * already created (see `createdRelatedIds`) link to it instead, so a Related
 * Record is never created twice. Records that could not be created stay
 * `create`, to be tried again.
 */
export function linkAlreadyCreated(
  resolved: ResolvedValue[],
  createdIds: ReadonlyMap<string, RelatedRecordId>
): ResolvedValue[] {
  return resolved.map((value) => {
    if (value.decision?.action !== 'create') return value;
    const id = createdIds.get(creationKey(value.kind, value.decision.name));
    return id === undefined ? value : { ...value, decision: { action: 'link', id, name: value.decision.name } };
  });
}

/**
 * For Fix & Retry: the rows with only their Relationship Field values that
 * are not in `decided` (by `relatedValueKey`), the others emptied. These are
 * the values new or changed since the Commit that decided the others, and
 * the only ones Resolution needs to see. The rows given are not changed.
 */
export function undecidedValuesOnly<R extends { data: unknown }>(
  rows: R[],
  fields: Pick<FieldConfig, 'key' | 'relationship'>[],
  decided: ReadonlyMap<string, unknown>
): R[] {
  const relationshipFields = relationshipKinds(fields).flatMap(({ kind, fields: kindFields }) =>
    kindFields.map((field) => ({ kind, key: field.key }))
  );
  return rows.map((row) => {
    const data = { ...(row.data as Record<string, unknown>) };
    for (const field of relationshipFields) {
      if (decided.has(relatedValueKey(field.kind, relatedValueOf(data[field.key])))) data[field.key] = '';
    }
    return { ...row, data };
  });
}

const isValidId = (id: unknown): id is RelatedRecordId =>
  (typeof id === 'string' && id !== '') || (typeof id === 'number' && Number.isFinite(id));

export interface CreateRelatedOptions {
  createRelated: CreateRelated;
  /** For the reasons Data Weaver gives itself; English by default */
  messages?: ResolvedMessages;
  /** Once aborted, no further record is created (one already asked for still settles) */
  signal?: AbortSignal;
}

/**
 * Create the planned Related Records with the Host App, one at a time, in
 * plan order: the next is asked for only once the previous one has an
 * answer. A creation that rejects, or resolves without an ID, is recorded
 * with a reason (the Host App's Error message) and the others carry on. When
 * `signal` is aborted, the records not yet asked for are left out.
 */
export async function createRelatedRecords(
  creations: RelatedCreation[],
  { createRelated, messages = ENGLISH_MESSAGES, signal }: CreateRelatedOptions
): Promise<CreatedRelated[]> {
  const created: CreatedRelated[] = [];
  for (const creation of creations) {
    if (signal?.aborted) break;
    try {
      const id: unknown = await createRelated(creation.kind, creation.name);
      if (isValidId(id)) {
        created.push({ ...creation, id });
      } else {
        console.error(
          `[data-weaver] createRelated(${JSON.stringify(creation.kind)}, ${JSON.stringify(creation.name)}) must resolve with the new record's ID (a string or number); it resolved with ${JSON.stringify(id)}.`
        );
        created.push({ ...creation, reason: messages.resolution.invalidId() });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      created.push({ ...creation, reason: message.trim() !== '' ? message : messages.commit.noReason() });
    }
  }
  return created;
}

/** Every row either ready to save, with IDs in its Relationship Fields, or rejected */
export interface SubstitutedRows<TRecord> {
  ready: ImportRow<TRecord>[];
  rejected: RejectedRow<TRecord>[];
}

/**
 * Put Related Record IDs in place of names: each Relationship Field value
 * becomes the ID of the record it was resolved to (existing or just
 * created), so rows never carry names. The rows given are not changed. A row
 * pointing to a record that could not be created is not sent: it becomes a
 * Rejected Row (`relatedNotCreated`) naming that record, with the field it
 * came from, and its record as reviewed.
 *
 * Each row gets its own decision for a value when it has one (Homonyms'
 * per-row overrides), else the value's: rows using the same name can point
 * to different records. Every value in `rows` must be in `resolved` with a
 * decision for each of its rows (Commit starts only when nothing blocks it);
 * otherwise this throws.
 */
export function substituteRelatedIds<TRecord>(
  rows: ImportRow<TRecord>[],
  fields: Pick<FieldConfig, 'key' | 'relationship'>[],
  resolved: ResolvedValue[],
  created: CreatedRelated[],
  messages: ResolvedMessages = ENGLISH_MESSAGES
): SubstitutedRows<TRecord> {
  const outcomeOf = new Map<string, CreatedRelated>();
  for (const creation of created) outcomeOf.set(creationKey(creation.kind, creation.name), creation);
  const valueOf = new Map(resolved.map((value) => [relatedValueKey(value.kind, value.value), value]));

  type Target = { id: RelatedRecordId } | { failed: CreatedRelated | undefined; name: string };
  const targetOf = (value: ResolvedValue | undefined, rowIndex: number): Target | undefined => {
    const decision = value && decisionForRow(value, rowIndex);
    if (!decision) return undefined;
    if (decision.action === 'link') return { id: decision.id };
    const outcome = outcomeOf.get(creationKey(value.kind, decision.name));
    return outcome && 'id' in outcome ? { id: outcome.id } : { failed: outcome, name: decision.name };
  };

  const relationshipFields = relationshipKinds(fields).flatMap(({ kind, fields: kindFields }) =>
    kindFields.map((field) => ({ kind, key: field.key }))
  );
  const result: SubstitutedRows<TRecord> = { ready: [], rejected: [] };

  rowLoop: for (const row of rows) {
    const record = { ...(row.record as Record<string, unknown>) };
    for (const field of relationshipFields) {
      const value = relatedValueOf(record[field.key]);
      if (value === '') continue;
      const target = targetOf(valueOf.get(relatedValueKey(field.kind, value)), row.rowIndex);
      if (!target) {
        throw new Error(`The ${field.key} value "${String(record[field.key])}" of row ${row.rowIndex + 1} was not resolved.`);
      }
      if ('failed' in target) {
        const reason = target.failed && 'reason' in target.failed ? target.failed.reason : messages.commit.noReason();
        result.rejected.push({
          ...row,
          reason: messages.resolution.notCreated({ name: target.name, reason }),
          field: field.key,
          cause: 'relatedNotCreated',
        });
        continue rowLoop;
      }
      record[field.key] = target.id;
    }
    result.ready.push({ ...row, record: record as TRecord });
  }
  return result;
}
