/**
 * The first phase of a Commit with Relationship Fields, before any row is
 * saved: create the new Related Records chosen in Resolution, once each and
 * one at a time, then put Related Record IDs in place of names in the rows
 * (ADR-0001). The rows then go to `commitRows` like any other.
 */

import type { CreateRelated, FieldConfig, ImportRow, RejectedRow, RelatedRecordId } from './types';
import { ENGLISH_MESSAGES, type ResolvedMessages } from './messages';
import { normaliseForMatch } from './normalise';
import { relatedValueKey, relatedValueOf, relationshipKinds, type ResolvedValue } from './resolution';

/** A new Related Record to create at the start of Commit */
export interface RelatedCreation {
  kind: string;
  /** The stored name, as confirmed in Resolution */
  name: string;
  /** The values (`relatedValueKey`) that will point to it */
  keys: string[];
}

/** A creation and its outcome: the new record's ID, or why it was not created */
export type CreatedRelated = RelatedCreation & ({ id: RelatedRecordId } | { reason: string });

/**
 * The new Related Records a Commit creates: one per value decided `create`,
 * and one only for values whose names are a Normalised Match of each other
 * (e.g. the Importer gave `G. Rossi` the name `Galleria Rossi`). A value used
 * in several fields is one value, so it is created once. Kinds never mix.
 */
export function planRelatedCreations(resolved: ResolvedValue[]): RelatedCreation[] {
  const plan = new Map<string, RelatedCreation>();
  for (const value of resolved) {
    if (value.decision?.action !== 'create') continue;
    const id = relatedValueKey(value.kind, normaliseForMatch(value.decision.name));
    const key = relatedValueKey(value.kind, value.value);
    const planned = plan.get(id);
    if (planned) planned.keys.push(key);
    else plan.set(id, { kind: value.kind, name: value.decision.name, keys: [key] });
  }
  return [...plan.values()];
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
 * Every value in `rows` must be in `resolved` with a decision (Commit starts
 * only when nothing blocks it); otherwise this throws.
 */
export function substituteRelatedIds<TRecord>(
  rows: ImportRow<TRecord>[],
  fields: Pick<FieldConfig, 'key' | 'relationship'>[],
  resolved: ResolvedValue[],
  created: CreatedRelated[],
  messages: ResolvedMessages = ENGLISH_MESSAGES
): SubstitutedRows<TRecord> {
  const outcomeOf = new Map<string, CreatedRelated>();
  for (const creation of created) for (const key of creation.keys) outcomeOf.set(key, creation);

  type Target = { id: RelatedRecordId } | { failed: CreatedRelated | undefined; name: string };
  const targets = new Map<string, Target>();
  for (const value of resolved) {
    const key = relatedValueKey(value.kind, value.value);
    const { decision } = value;
    if (!decision) continue;
    if (decision.action === 'link') {
      targets.set(key, { id: decision.id });
    } else {
      const outcome = outcomeOf.get(key);
      targets.set(key, outcome && 'id' in outcome ? { id: outcome.id } : { failed: outcome, name: decision.name });
    }
  }

  const relationshipFields = relationshipKinds(fields).flatMap(({ kind, fields: kindFields }) =>
    kindFields.map((field) => ({ kind, key: field.key }))
  );
  const result: SubstitutedRows<TRecord> = { ready: [], rejected: [] };

  rowLoop: for (const row of rows) {
    const record = { ...(row.record as Record<string, unknown>) };
    for (const field of relationshipFields) {
      const value = relatedValueOf(record[field.key]);
      if (value === '') continue;
      const target = targets.get(relatedValueKey(field.kind, value));
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
