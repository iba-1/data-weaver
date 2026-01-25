import React from 'react';
import { ArrowRight, Check, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnMapping, TargetField } from '@/lib/import-wizard/types';
import { TARGET_FIELDS } from '@/lib/import-wizard/types';
import { getUnmappedTargetFields } from '@/lib/import-wizard/matcher';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface ColumnMapperProps {
  mappings: ColumnMapping[];
  onMappingChange: (sourceColumn: string, targetField: TargetField | null) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  className?: string;
}

export function ColumnMapper({
  mappings,
  onMappingChange,
  onConfirm,
  isLoading = false,
  className,
}: ColumnMapperProps) {
  const unmappedTargetFields = getUnmappedTargetFields(mappings, TARGET_FIELDS);
  const mappedCount = mappings.filter((m) => m.targetField !== null).length;
  const requiredFieldsMapped = TARGET_FIELDS.filter(
    (f) => f.required && mappings.some((m) => m.targetField === f.key)
  ).length;
  const requiredFieldsCount = TARGET_FIELDS.filter((f) => f.required).length;

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
          {mappedCount}/{TARGET_FIELDS.length} mapped
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
            unmappedTargetFields={unmappedTargetFields}
            onMappingChange={onMappingChange}
          />
        ))}
      </div>

      {/* Unmapped required fields warning */}
      {requiredFieldsMapped < requiredFieldsCount && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-3">
          <p className="text-sm font-medium text-warning">
            Missing required fields:{' '}
            {TARGET_FIELDS.filter(
              (f) => f.required && !mappings.some((m) => m.targetField === f.key)
            )
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
        disabled={requiredFieldsMapped < requiredFieldsCount}
      >
        Continue to Validation
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

interface MappingRowProps {
  mapping: ColumnMapping;
  unmappedTargetFields: typeof TARGET_FIELDS;
  onMappingChange: (sourceColumn: string, targetField: TargetField | null) => void;
}

function MappingRow({ mapping, unmappedTargetFields, onMappingChange }: MappingRowProps) {
  const currentTarget = mapping.targetField
    ? TARGET_FIELDS.find((f) => f.key === mapping.targetField)
    : null;

  // Available options: unmapped fields + current field (if any)
  const availableFields = [
    ...unmappedTargetFields,
    ...(currentTarget ? [currentTarget] : []),
  ].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div
      className={cn(
        'mapping-card flex items-center gap-4',
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
            onMappingChange(
              mapping.sourceColumn,
              value === 'unmapped' ? null : (value as TargetField)
            )
          }
        >
          <SelectTrigger
            className={cn(
              'w-full',
              !mapping.targetField && 'text-muted-foreground'
            )}
          >
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
                  {field.required && (
                    <span className="text-destructive">*</span>
                  )}
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
