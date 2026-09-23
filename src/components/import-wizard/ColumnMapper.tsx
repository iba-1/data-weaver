import React from 'react';
import { ArrowRight, Check, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnMapping, FieldConfig } from '@/lib/import-wizard/types';
import { getUnmappedTargetFields } from '@/lib/import-wizard/matcher';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WizardRoot } from './WizardRoot';

interface ColumnMapperProps<TKey extends string = string> {
  mappings: ColumnMapping<TKey>[];
  fields: FieldConfig<TKey>[];
  onMappingChange: (sourceColumn: string, targetField: TKey | null) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  className?: string;
}

/** Mapping step: match the file's columns to the Output Shape's fields */
export function ColumnMapper<TKey extends string = string>(props: ColumnMapperProps<TKey>) {
  return (
    <WizardRoot>
      <ColumnMapperContent {...props} />
    </WizardRoot>
  );
}

function ColumnMapperContent<TKey extends string = string>({
  mappings,
  fields,
  onMappingChange,
  onConfirm,
  isLoading = false,
  className,
}: ColumnMapperProps<TKey>) {
  const unmappedTargetFields = getUnmappedTargetFields(mappings, fields);
  const mappedCount = mappings.filter((m) => m.targetField !== null).length;
  const requiredFields = fields.filter((f) => f.required);
  const requiredFieldsMapped = requiredFields.filter((f) =>
    mappings.some((m) => m.targetField === f.key)
  ).length;

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-5 w-24" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Map Columns</h3>
          <p className="text-sm text-muted-foreground">
            Match your file columns to the expected fields
          </p>
        </div>
        <Badge variant="secondary" className="font-mono">
          {mappedCount}/{fields.length} mapped
        </Badge>
      </div>

      {/* Auto-match indicator */}
      {mappings.some((m) => m.isAutoMatched && m.targetField) && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          <Sparkles className="h-4 w-4" />
          <span>Some columns were auto-matched. Review and adjust as needed.</span>
        </div>
      )}

      {/* Mapping list */}
      <div className="space-y-3">
        {mappings.map((mapping) => (
          <MappingRow
            key={mapping.sourceColumn}
            mapping={mapping}
            fields={fields}
            unmappedTargetFields={unmappedTargetFields}
            onMappingChange={onMappingChange}
          />
        ))}
      </div>

      {/* Unmapped required fields warning */}
      {requiredFieldsMapped < requiredFields.length && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-3">
          <p className="text-sm font-medium text-warning">
            Missing required fields:{' '}
            {requiredFields
              .filter((f) => !mappings.some((m) => m.targetField === f.key))
              .map((f) => f.label)
              .join(', ')}
          </p>
        </div>
      )}

      {/* Confirm button */}
      <Button
        onClick={onConfirm}
        className="w-full"
        size="lg"
        disabled={requiredFieldsMapped < requiredFields.length}
      >
        Continue to Validation
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

interface MappingRowProps<TKey extends string> {
  mapping: ColumnMapping<TKey>;
  fields: FieldConfig<TKey>[];
  unmappedTargetFields: FieldConfig<TKey>[];
  onMappingChange: (sourceColumn: string, targetField: TKey | null) => void;
}

function MappingRow<TKey extends string>({
  mapping,
  fields,
  unmappedTargetFields,
  onMappingChange,
}: MappingRowProps<TKey>) {
  const currentTarget = mapping.targetField
    ? fields.find((f) => f.key === mapping.targetField)
    : null;

  // Available options: unmapped fields + current field (if any)
  const availableFields = [
    ...unmappedTargetFields,
    ...(currentTarget ? [currentTarget] : []),
  ].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div
      className={cn(
        'mapping-card flex items-center gap-[12px]',
        mapping.targetField && 'mapping-matched'
      )}
    >
      {/* Source column */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground truncate">
            {mapping.sourceColumn}
          </span>
          {mapping.isAutoMatched && mapping.targetField && (
            <Badge variant="outline" className="shrink-0 text-xs">
              <Sparkles className="mr-1 h-3 w-3" />
              Auto
            </Badge>
          )}
        </div>
      </div>

      {/* Arrow */}
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />

      {/* Target field select */}
      <div className="w-48 shrink-0">
        <Select
          value={mapping.targetField || 'unmapped'}
          onValueChange={(value) =>
            onMappingChange(mapping.sourceColumn, value === 'unmapped' ? null : (value as TKey))
          }
        >
          <SelectTrigger className={cn('w-full', !mapping.targetField && 'text-muted-foreground')}>
            <SelectValue placeholder="Select field..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unmapped">
              <span className="text-muted-foreground">Don't import</span>
            </SelectItem>
            {availableFields.map((field) => (
              <SelectItem key={field.key} value={field.key}>
                <span className="flex items-center gap-2">
                  {field.label}
                  {field.required && <span className="text-destructive">*</span>}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status indicator */}
      <div className="w-6 shrink-0">
        {mapping.targetField ? (
          <Check className="h-5 w-5 text-success" />
        ) : (
          <X className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
