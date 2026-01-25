import type { ColumnMapping, TargetField, TARGET_FIELDS } from './types';

// Fuzzy matching keywords for each target field
const FIELD_KEYWORDS: Record<TargetField, string[]> = {
  title: ['title', 'name', 'artwork', 'piece', 'work', 'obra', 'titulo', 'nombre'],
  artist: ['artist', 'author', 'creator', 'painter', 'sculptor', 'artista', 'autor'],
  period: ['period', 'era', 'year', 'date', 'century', 'time', 'epoca', 'periodo', 'año', 'fecha'],
  technique: ['technique', 'medium', 'material', 'style', 'method', 'tecnica', 'medio', 'estilo'],
  valueAmount: ['value', 'price', 'amount', 'cost', 'worth', 'estimate', 'valor', 'precio', 'monto'],
  valueCurrency: ['currency', 'curr', 'money', 'unit', 'moneda', 'divisa'],
};

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function calculateSimilarity(source: string, keywords: string[]): number {
  const normalized = normalizeString(source);
  
  // Exact match with any keyword
  for (const keyword of keywords) {
    if (normalized === normalizeString(keyword)) {
      return 1.0;
    }
  }
  
  // Contains keyword
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeString(keyword);
    if (normalized.includes(normalizedKeyword) || normalizedKeyword.includes(normalized)) {
      return 0.8;
    }
  }
  
  // Partial match (at least 3 chars in common)
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeString(keyword);
    if (normalized.length >= 3 && normalizedKeyword.length >= 3) {
      // Check if first 3 chars match
      if (normalized.substring(0, 3) === normalizedKeyword.substring(0, 3)) {
        return 0.6;
      }
    }
  }
  
  return 0;
}

export function autoMatchColumns(sourceColumns: string[]): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];
  const usedTargetFields: Set<TargetField> = new Set();
  
  // First pass: find best matches with high confidence
  const columnScores: Array<{
    sourceColumn: string;
    targetField: TargetField;
    confidence: number;
  }> = [];
  
  for (const sourceColumn of sourceColumns) {
    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
      const confidence = calculateSimilarity(sourceColumn, keywords);
      if (confidence > 0.5) {
        columnScores.push({
          sourceColumn,
          targetField: field as TargetField,
          confidence,
        });
      }
    }
  }
  
  // Sort by confidence descending
  columnScores.sort((a, b) => b.confidence - a.confidence);
  
  // Assign best matches, avoiding duplicates
  const usedSourceColumns: Set<string> = new Set();
  
  for (const score of columnScores) {
    if (!usedSourceColumns.has(score.sourceColumn) && !usedTargetFields.has(score.targetField)) {
      mappings.push({
        sourceColumn: score.sourceColumn,
        targetField: score.targetField,
        confidence: score.confidence,
        isAutoMatched: true,
      });
      usedSourceColumns.add(score.sourceColumn);
      usedTargetFields.add(score.targetField);
    }
  }
  
  // Add remaining source columns without matches
  for (const sourceColumn of sourceColumns) {
    if (!usedSourceColumns.has(sourceColumn)) {
      mappings.push({
        sourceColumn,
        targetField: null,
        confidence: 0,
        isAutoMatched: false,
      });
    }
  }
  
  return mappings;
}

export function getUnmappedTargetFields(
  mappings: ColumnMapping[],
  targetFields: typeof TARGET_FIELDS
): typeof TARGET_FIELDS {
  const mappedFields = new Set(mappings.map((m) => m.targetField).filter(Boolean));
  return targetFields.filter((field) => !mappedFields.has(field.key));
}

export function updateMapping(
  mappings: ColumnMapping[],
  sourceColumn: string,
  targetField: TargetField | null
): ColumnMapping[] {
  // Remove the target field from any existing mapping
  const updatedMappings = mappings.map((m) => {
    if (m.targetField === targetField && m.sourceColumn !== sourceColumn) {
      return { ...m, targetField: null, confidence: 0, isAutoMatched: false };
    }
    return m;
  });
  
  // Update the source column's mapping
  return updatedMappings.map((m) => {
    if (m.sourceColumn === sourceColumn) {
      return { ...m, targetField, confidence: 1, isAutoMatched: false };
    }
    return m;
  });
}
