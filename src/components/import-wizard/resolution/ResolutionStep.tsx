import { useId, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Download, Link2, Plus, RotateCcw, Users } from 'lucide-react';
import type { FieldConfig } from '@/lib/import-wizard/types';
import {
  decisionsInEffect,
  relatedValueKey,
  type RelatedDecision,
  type RelationshipKind,
  type ResolvedValue,
} from '@/lib/import-wizard/resolution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMessages } from '../messages';
import type { LookupState, RelatedChoice } from './useResolution';

interface ResolutionStepProps {
  kinds: RelationshipKind<Pick<FieldConfig, 'key' | 'label' | 'relationship'>>[];
  lookup: LookupState;
  resolved: ResolvedValue[];
  /** What the Importer typed as new records' names, by relatedValueKey */
  names: ReadonlyMap<string, string>;
  blockers: { undecided: number; unnamed: number };
  canCommit: boolean;
  /** Rows that will be imported (included rows) */
  rowCount: number;
  /** A row's text that identifies it at a glance (its first field), by rowIndex */
  describeRow: (rowIndex: number) => string;
  onNameChange: (key: string, name: string) => void;
  /** Choose for a Homonym, by relatedValueKey */
  onChoose: (key: string, choice: RelatedChoice) => void;
  /** Choose for one row of a Homonym, or (null) let the row follow the value's choice */
  onChooseForRow: (key: string, rowIndex: number, choice: RelatedChoice | null) => void;
  onRetry: () => void;
  onBack: () => void;
  onComplete: () => void;
}

/**
 * Resolution: every distinct Relationship Field value of the file, once per
 * kind, grouped as several matches (Homonyms), matched existing, will be
 * created, or needing a decision. A pure decision step: nothing is created
 * until the Importer imports.
 */
export function ResolutionStep({
  kinds,
  lookup,
  resolved,
  names,
  blockers,
  canCommit,
  rowCount,
  describeRow,
  onNameChange,
  onChoose,
  onChooseForRow,
  onRetry,
  onBack,
  onComplete,
}: ResolutionStepProps) {
  const m = useMessages();

  const backButton = (
    <Button variant="outline" onClick={onBack}>
      <ChevronLeft className="mr-2 h-4 w-4" />
      {m.resolution.back()}
    </Button>
  );

  const header = (
    <div>
      <h3 className="text-lg font-semibold text-foreground">{m.resolution.title()}</h3>
      <p className="text-sm text-muted-foreground">{m.resolution.description()}</p>
    </div>
  );

  if (lookup.status === 'error') {
    return (
      <div className="space-y-4">
        {header}
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">{m.resolution.lookupFailed({ fields: lookup.fields, reason: lookup.reason })}</p>
            <p className="text-muted-foreground">{m.resolution.blocked()}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          {backButton}
          <Button onClick={onRetry}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {m.resolution.retry()}
          </Button>
        </div>
      </div>
    );
  }

  if (lookup.status !== 'ready') {
    return (
      <div className="space-y-4">
        {header}
        {lookup.status === 'loading' && (
          <p role="status" className="text-sm text-muted-foreground">
            {m.resolution.loading({ fields: lookup.fields, count: lookup.count })}
          </p>
        )}
        <Skeleton className="h-64 w-full" />
        {backButton}
      </div>
    );
  }

  const sections = kinds
    .map((kind) => ({ ...kind, values: resolved.filter((v) => v.kind === kind.kind) }))
    .filter((section) => section.values.length > 0);

  return (
    <div className="space-y-6">
      {header}

      {sections.length === 0 && <p className="text-sm text-muted-foreground">{m.resolution.empty()}</p>}

      {sections.map((section) => {
        const fieldLabels = section.fields.map((f) => f.label);
        // Homonyms stay in their own group once decided, so every group is shown in full
        const homonyms = section.values.filter((v) => v.group === 'homonyms');
        const others = section.values.filter((v) => v.group !== 'homonyms');
        const matched = others.filter((v) => v.decision?.action === 'link');
        const created = others.filter((v) => v.decision?.action === 'create');
        const undecided = others.filter((v) => !v.decision);
        return (
          <Region
            key={section.kind}
            title={m.resolution.kindTitle({ fields: fieldLabels.join(', '), count: fieldLabels.length })}
            level="kind"
          >
            {homonyms.length > 0 && (
              <Region
                title={m.resolution.homonymsTitle({ count: homonyms.length })}
                description={m.resolution.homonymsDescription()}
                tone="warning"
              >
                {homonyms.map((value) => {
                  const key = relatedValueKey(value.kind, value.value);
                  return (
                    <HomonymItem
                      key={value.value}
                      value={value}
                      typedName={names.get(key) ?? value.defaultName}
                      describeRow={describeRow}
                      onNameChange={(name) => onNameChange(key, name)}
                      onChoose={(choice) => onChoose(key, choice)}
                      onChooseForRow={(rowIndex, choice) => onChooseForRow(key, rowIndex, choice)}
                    />
                  );
                })}
              </Region>
            )}

            {undecided.length > 0 && (
              <Region
                title={m.resolution.undecidedTitle({ count: undecided.length })}
                description={m.resolution.undecidedDescription()}
                tone="warning"
              >
                {undecided.map((value) => (
                  <ValueItem key={value.value} value={value}>
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                      {value.defaultName}
                    </span>
                  </ValueItem>
                ))}
              </Region>
            )}

            {matched.length > 0 && (
              <Region
                title={m.resolution.matchedTitle({ count: matched.length })}
                description={m.resolution.matchedDescription()}
                tone="success"
              >
                {matched.map((value) => {
                  const candidate = value.candidates.find((c) => c.match === 'normalised');
                  return (
                    <ValueItem key={value.value} value={value}>
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <Link2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                        {m.resolution.candidate({
                          name: candidate?.name ?? '',
                          description: candidate?.description ?? '',
                        })}
                      </span>
                    </ValueItem>
                  );
                })}
              </Region>
            )}

            {created.length > 0 && (
              <Region
                title={m.resolution.createTitle({ count: created.length })}
                description={m.resolution.createDescription()}
                tone="info"
              >
                {created.map((value) => {
                  const key = relatedValueKey(value.kind, value.value);
                  return (
                    <ValueItem key={value.value} value={value}>
                      <NewRecordName
                        value={value}
                        typed={names.get(key) ?? value.defaultName}
                        onChange={(name) => onNameChange(key, name)}
                      />
                    </ValueItem>
                  );
                })}
              </Region>
            )}
          </Region>
        );
      })}

      <div className="sticky bottom-0 left-0 right-0 z-10 -mx-1 border-t bg-background/95 px-1 pb-2 pt-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          {backButton}
          <div className="flex items-center gap-3">
            {blockers.undecided > 0 ? (
              <span className="text-sm text-warning">{m.resolution.blockedUndecided({ count: blockers.undecided })}</span>
            ) : (
              blockers.unnamed > 0 && (
                <span className="text-sm text-destructive">{m.resolution.blockedUnnamed({ count: blockers.unnamed })}</span>
              )
            )}
            <Button onClick={onComplete} disabled={!canCommit} size="lg">
              <Download className="mr-2 h-4 w-4" />
              {m.resolution.complete({ count: rowCount })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const TONES = {
  success: 'border-l-success',
  info: 'border-l-primary',
  warning: 'border-l-warning',
} as const;

/** A titled part of the step: one kind's values, or one group within it */
function Region({
  title,
  description,
  tone,
  level = 'group',
  children,
}: {
  title: string;
  description?: string;
  tone?: keyof typeof TONES;
  level?: 'kind' | 'group';
  children: ReactNode;
}) {
  const titleId = useId();
  if (level === 'kind') {
    return (
      <section aria-labelledby={titleId} className="space-y-4">
        <h4 id={titleId} className="border-b pb-1 text-base font-semibold text-foreground">
          {title}
        </h4>
        {children}
      </section>
    );
  }
  return (
    <section aria-labelledby={titleId} className={cn('space-y-2 border-l-2 pl-3', tone && TONES[tone])}>
      <div>
        <h5 id={titleId} className="text-sm font-medium text-foreground">
          {title}
        </h5>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

/**
 * One distinct value: what it resolves to, the spellings folded into it, its
 * rows, and what the lookup found (or `details` in its place)
 */
function ValueItem({ value, details, children }: { value: ResolvedValue; details?: ReactNode; children: ReactNode }) {
  const m = useMessages();
  const spellings = value.spellings.map((s) => m.resolution.spelling({ text: s.text, count: s.count })).join(', ');
  return (
    <li className="space-y-1 rounded-md border bg-card px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        {children}
        <span className="shrink-0 text-xs text-muted-foreground">{m.resolution.rowCount({ count: value.rows.length })}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {m.resolution.spellings({ spellings, count: value.spellings.length })}
      </p>
      {details ?? (!value.decision && value.group !== 'pending' && <Candidates value={value} />)}
    </li>
  );
}

/** The name a new record will be created with, editable; an empty name blocks the import */
function NewRecordName({ value, typed, onChange }: { value: ResolvedValue; typed: string; onChange: (name: string) => void }) {
  const m = useMessages();
  const missingName = typed.trim() === '';
  return (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <Input
          value={typed}
          onChange={(e) => onChange(e.target.value)}
          aria-label={m.resolution.nameLabel({ value: value.defaultName })}
          aria-invalid={missingName}
          className={cn('h-8 max-w-sm text-sm', missingName && 'border-destructive')}
        />
      </span>
      {missingName && <p className="text-xs text-destructive">{m.resolution.nameRequired()}</p>}
    </>
  );
}

/** The value of a Homonym choice control: a candidate by position, or "create new"; '' when none */
const CREATE_NEW = 'create';
const candidateOption = (index: number) => `candidate-${index}`;

/**
 * A value matching several existing records (Homonyms): the Importer picks
 * one of them or "create new" for the value, and can choose differently for
 * individual rows. Every row assigned to "create new" points to the same one
 * new record, named here.
 */
function HomonymItem({
  value,
  typedName,
  describeRow,
  onNameChange,
  onChoose,
  onChooseForRow,
}: {
  value: ResolvedValue;
  typedName: string;
  describeRow: (rowIndex: number) => string;
  onNameChange: (name: string) => void;
  onChoose: (choice: RelatedChoice) => void;
  onChooseForRow: (rowIndex: number, choice: RelatedChoice | null) => void;
}) {
  const m = useMessages();
  const id = useId();
  const panelId = `${id}-rows`;
  const toggleId = `${id}-toggle`;
  // Open from the start when rows already have their own choice (e.g. back from the review)
  const [perRowOpen, setPerRowOpen] = useState(value.rowDecisions.size > 0);
  const candidates = value.candidates.filter((c) => c.match === 'normalised');

  const optionOf = (decision: RelatedDecision | null | undefined): string => {
    if (!decision) return '';
    if (decision.action === 'create') return CREATE_NEW;
    const index = candidates.findIndex((c) => c.id === decision.id);
    return index < 0 ? '' : candidateOption(index);
  };
  const choiceOf = (option: string): RelatedChoice | null => {
    if (option === CREATE_NEW) return { action: 'create' };
    const candidate = candidates.find((_, index) => candidateOption(index) === option);
    return candidate ? { action: 'link', id: candidate.id, name: candidate.name } : null;
  };
  const labelOf = (index: number) =>
    m.resolution.candidate({ name: candidates[index].name, description: candidates[index].description ?? '' });

  const anyRowCreates = decisionsInEffect(value).some((decision) => decision?.action === 'create');

  const choices = (
    <div className="space-y-2 pt-1 text-xs">
      <p className="text-foreground">{m.resolution.homonyms({ count: candidates.length })}</p>
      <RadioGroup
        value={optionOf(value.decision)}
        onValueChange={(option) => {
          const choice = choiceOf(option);
          if (choice) onChoose(choice);
        }}
        aria-label={m.resolution.homonymChoice({ value: value.defaultName })}
        className="gap-1.5 pl-3"
      >
        {candidates.map((candidate, index) => (
          <div key={String(candidate.id)} className="flex items-center gap-2">
            <RadioGroupItem value={candidateOption(index)} id={`${id}-${index}`} />
            <Label htmlFor={`${id}-${index}`} className="text-xs font-normal text-foreground">
              {labelOf(index)}
            </Label>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <RadioGroupItem value={CREATE_NEW} id={`${id}-create`} />
          <Label htmlFor={`${id}-create`} className="text-xs font-normal text-foreground">
            {m.resolution.createNew()}
          </Label>
        </div>
      </RadioGroup>

      {anyRowCreates && (
        <div className="space-y-1 pl-3">
          <NewRecordName value={value} typed={typedName} onChange={onNameChange} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          id={toggleId}
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          aria-expanded={perRowOpen}
          aria-controls={panelId}
          onClick={() => setPerRowOpen((open) => !open)}
        >
          {perRowOpen ? (
            <ChevronDown className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          )}
          {m.resolution.perRow({ count: value.rows.length })}
        </Button>
        {value.rowDecisions.size > 0 && (
          <span className="text-muted-foreground">{m.resolution.perRowCount({ count: value.rowDecisions.size })}</span>
        )}
      </div>

      {perRowOpen && (
        <ul id={panelId} aria-labelledby={toggleId} className="max-h-72 space-y-1 overflow-y-auto pl-3">
          {value.rows.map((rowIndex) => (
            <li key={rowIndex} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-foreground">
                {m.resolution.rowLabel({ row: rowIndex + 1, title: describeRow(rowIndex) })}
              </span>
              <select
                value={optionOf(value.rowDecisions.get(rowIndex))}
                onChange={(e) => onChooseForRow(rowIndex, choiceOf(e.target.value))}
                aria-label={m.resolution.rowChoice({ row: rowIndex + 1, value: value.defaultName })}
                className="h-7 max-w-[55%] shrink-0 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{m.resolution.rowDefault()}</option>
                {candidates.map((candidate, index) => (
                  <option key={String(candidate.id)} value={candidateOption(index)}>
                    {labelOf(index)}
                  </option>
                ))}
                <option value={CREATE_NEW}>{m.resolution.createNew()}</option>
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <ValueItem value={value} details={choices}>
      <span className="flex items-center gap-2 font-medium text-foreground">
        {decisionsInEffect(value).some((decision) => decision === null) ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        ) : (
          <Users className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        )}
        {value.defaultName}
      </span>
    </ValueItem>
  );
}

/** The existing records a value needs a decision between: Homonyms, or Possible Matches */
function Candidates({ value }: { value: ResolvedValue }) {
  const m = useMessages();
  const homonyms = value.group === 'homonyms';
  const shown = value.candidates.filter((c) => c.match === (homonyms ? 'normalised' : 'possible'));
  return (
    <div className="space-y-0.5 text-xs">
      <p className="text-foreground">
        {homonyms ? m.resolution.homonyms({ count: shown.length }) : m.resolution.possible({ count: shown.length })}
      </p>
      {shown.map((candidate) => (
        <p key={String(candidate.id)} className="pl-3 text-muted-foreground">
          {m.resolution.candidate({ name: candidate.name, description: candidate.description ?? '' })}
        </p>
      ))}
    </div>
  );
}
