# React Import Wizard

A powerful, fully-featured data import wizard for React applications. Supports CSV and Excel file parsing, fuzzy column matching, inline editing, search/replace, undo/redo, and data export.

## Features

- 📁 **File Upload** - Drag-and-drop CSV/Excel files with validation
- 🔄 **Smart Column Mapping** - Fuzzy auto-matching with manual override
- ✏️ **Excel-like Editing** - Click-to-edit cells with keyboard navigation
- 🔍 **Search & Replace** - Find and mass-replace across all data
- ↩️ **Undo/Redo** - Full history support with keyboard shortcuts
- 📤 **Export** - Download data as CSV or Excel
- 🎨 **Customizable** - Define your own fields, validators, and styling

## Installation

```bash
npm install @your-org/react-import-wizard
```

### Peer Dependencies

```bash
npm install react react-dom xlsx lucide-react
```

## Quick Start

```tsx
import { ImportWizard } from '@your-org/react-import-wizard';
import type { FieldConfig } from '@your-org/react-import-wizard';

// Define your schema
type ProductKey = 'name' | 'sku' | 'price' | 'category';

const fields: FieldConfig<ProductKey>[] = [
  { 
    key: 'name', 
    label: 'Product Name', 
    type: 'string', 
    required: true,
    matchKeywords: ['name', 'title', 'product']
  },
  { 
    key: 'sku', 
    label: 'SKU', 
    type: 'string', 
    required: true,
    matchKeywords: ['sku', 'code', 'id']
  },
  { 
    key: 'price', 
    label: 'Price', 
    type: 'number',
    matchKeywords: ['price', 'cost', 'amount'],
    validate: (value) => {
      if (value !== null && (value as number) < 0) {
        return { type: 'error', message: 'Price cannot be negative' };
      }
      return null;
    }
  },
  { 
    key: 'category', 
    label: 'Category', 
    type: 'string',
    matchKeywords: ['category', 'type', 'group']
  },
];

function App() {
  const handleComplete = (data: Record<ProductKey, unknown>[]) => {
    console.log('Imported data:', data);
    // Send to API, update state, etc.
  };

  return (
    <ImportWizard
      fields={fields}
      requiredFields={['name', 'sku']}
      onComplete={handleComplete}
      title="Import Products"
    />
  );
}
```

## API Reference

### `<ImportWizard />`

The main component that orchestrates the 3-step import flow.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fields` | `FieldConfig<TKey>[]` | Artwork fields | Column/field configuration |
| `requiredFields` | `TKey[]` | `['title', 'artist']` | Fields that must have values |
| `onComplete` | `(data: TRecord[]) => void` | - | Called with valid rows when import completes |
| `onEvent` | `(event: ImportWizardEvent) => void` | - | Lifecycle event handler |
| `onRowParse` | `(event: RowParseEvent) => TRecord \| void` | - | Called for each row during parsing |
| `onRowComplete` | `(event: RowCompleteEvent) => void` | - | Called when a row passes validation |
| `validateRow` | `(data, rowIndex) => ValidationResult[]` | - | Custom row-level validation |
| `title` | `string` | `'Import Data'` | Wizard title |
| `description` | `string` | - | Description shown below title |
| `acceptedFileTypes` | `string[]` | `['.csv', '.xlsx', '.xls']` | Allowed file extensions |
| `maxFileSize` | `number` | `10485760` (10MB) | Maximum file size in bytes |
| `className` | `string` | - | Additional CSS classes |

### `FieldConfig<TKey>`

Configuration for each target field/column.

```typescript
interface FieldConfig<TKey extends string = string> {
  key: TKey;                    // Unique identifier
  label: string;                // Display label
  type: 'string' | 'number' | 'date' | 'boolean';
  required?: boolean;           // Required for valid row
  matchKeywords?: string[];     // Keywords for auto-matching
  validate?: (value, row) => ValidationResult | null;
  transform?: (value) => unknown;
  placeholder?: string;
}
```

### Events

#### `ImportWizardEvent`

```typescript
type ImportWizardEvent<TRecord> =
  | { type: 'FILE_PARSED'; data: ParsedFileData }
  | { type: 'COLUMNS_MAPPED'; mappings: ColumnMapping[] }
  | { type: 'ROW_PARSED'; event: RowParseEvent<TRecord> }
  | { type: 'ROW_COMPLETE'; event: RowCompleteEvent<TRecord> }
  | { type: 'DATA_VALIDATED'; rows: RowValidation<TRecord>[] }
  | { type: 'IMPORT_COMPLETED'; data: TRecord[] }
  | { type: 'ERROR'; error: string };
```

#### `RowParseEvent`

Emitted during parsing for each row. Return a modified record to transform data.

```typescript
interface RowParseEvent<TRecord> {
  rowIndex: number;
  rawData: Record<string, unknown>;
  parsedData: TRecord;
}
```

#### `RowCompleteEvent`

Emitted when a row is validated or edited.

```typescript
interface RowCompleteEvent<TRecord> {
  rowIndex: number;
  data: TRecord;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
```

## Individual Components

You can also use the components individually for custom implementations:

### `<FileUploader />`

Drag-and-drop file upload with validation.

```tsx
<FileUploader
  onFileSelected={(file) => console.log(file)}
  isLoading={false}
  error={null}
  helpText="Upload your CSV or Excel file"
/>
```

### `<ColumnMapper />`

Column mapping interface with auto-matching.

```tsx
<ColumnMapper
  mappings={mappings}
  fields={fields}
  onMappingChange={(source, target) => updateMapping(source, target)}
  onConfirm={() => goToValidation()}
/>
```

### `<DataValidator />`

Data review with editing, search, and export.

```tsx
<DataValidator
  validatedRows={rows}
  fields={fields}
  requiredFields={['name', 'sku']}
  onComplete={() => finishImport()}
  onBack={() => goToMapping()}
  onRowsChange={(rows) => setRows(rows)}
/>
```

### `<EditableCell />`

Single editable cell with keyboard support.

```tsx
<EditableCell
  value="Cell content"
  onSave={(newValue) => updateCell(newValue)}
  hasError={false}
  hasWarning={false}
  isHighlighted={false}
/>
```

### `<SearchBar />`

Search input with match counter.

```tsx
<SearchBar
  value={searchQuery}
  onChange={setSearchQuery}
  matchCount={5}
/>
```

### `<FindReplaceDialog />`

Find and replace dialog with options.

```tsx
<FindReplaceDialog
  onReplace={(find, replace, options) => replaceAll(find, replace, options)}
  getPreviewCount={(find, options) => countMatches(find, options)}
/>
```

## Utility Functions

### Parsing

```typescript
import { parseFile, isValidFileType } from '@your-org/react-import-wizard';

const data = await parseFile(file);
const isValid = isValidFileType('data.csv'); // true
```

### Column Matching

```typescript
import { autoMatchColumns, updateMapping } from '@your-org/react-import-wizard';

const mappings = autoMatchColumns(headers, fields);
const updated = updateMapping(mappings, 'source_col', 'target_field');
```

### Validation

```typescript
import { validateRows, revalidateRow, getValidationSummary } from '@your-org/react-import-wizard';

const validated = validateRows(rows, mappings, { fields, requiredFields });
const summary = getValidationSummary(validated);
// { total: 100, valid: 95, withErrors: 3, withWarnings: 2 }
```

### Export

```typescript
import { exportData, exportToBlob } from '@your-org/react-import-wizard';

// Download directly
exportData(rows, fields, { format: 'xlsx', filename: 'export' });

// Get blob for custom handling
const blob = exportToBlob(rows, fields, { format: 'csv', onlyValid: true });
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` / `Click` | Start editing cell |
| `Enter` | Save cell |
| `Escape` | Cancel editing |
| `F2` | Start editing cell |
| `Tab` | Save and move to next cell |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+Enter` (in Find/Replace) | Replace all |

## Styling

The library uses CSS custom properties for theming. Override these in your CSS:

```css
:root {
  --primary: 210 100% 50%;
  --success: 142 76% 36%;
  --warning: 38 92% 50%;
  --destructive: 0 72% 51%;
  
  /* Wizard-specific tokens */
  --dropzone-bg: 210 40% 98%;
  --step-active: 210 100% 45%;
  --validation-error: 0 72% 95%;
}
```

## TypeScript

Full TypeScript support with generics:

```typescript
import type {
  FieldConfig,
  ColumnMapping,
  RowValidation,
  ValidationResult,
  ImportWizardEvent,
  RowParseEvent,
  RowCompleteEvent,
} from '@your-org/react-import-wizard';

type MyFields = 'name' | 'email' | 'age';
type MyRecord = Record<MyFields, unknown>;

const fields: FieldConfig<MyFields>[] = [/* ... */];
const handler = (event: ImportWizardEvent<MyRecord>) => {/* ... */};
```

## License

MIT
