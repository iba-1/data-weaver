<p align="center">
  <img src="https://img.shields.io/npm/v/react-import-wizard?style=flat-square&color=00b4d8" alt="npm version" />
  <img src="https://img.shields.io/npm/dm/react-import-wizard?style=flat-square&color=00b4d8" alt="npm downloads" />
  <img src="https://img.shields.io/bundlephobia/minzip/react-import-wizard?style=flat-square&color=00b4d8" alt="bundle size" />
  <img src="https://img.shields.io/github/license/your-org/react-import-wizard?style=flat-square&color=00b4d8" alt="license" />
  <img src="https://img.shields.io/badge/TypeScript-Ready-3178c6?style=flat-square" alt="TypeScript" />
</p>

<h1 align="center">⚡ React Import Wizard</h1>

<p align="center">
  <strong>The most powerful data import experience for React applications.</strong>
  <br />
  <em>CSV & Excel parsing • Smart column matching • Inline editing • Undo/Redo • Export</em>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-examples">Examples</a> •
  <a href="#-api-reference">API Reference</a> •
  <a href="#-customization">Customization</a>
</p>

---

## 🎯 Why React Import Wizard?

Building data import functionality is **hard**. Users expect Excel-like editing, smart column detection, validation feedback, and the ability to fix errors on the spot. React Import Wizard delivers all of this out of the box.

| Without React Import Wizard | With React Import Wizard |
|---------------------------|-------------------------|
| ❌ Build your own file parser | ✅ CSV/Excel parsing included |
| ❌ Manual column mapping UI | ✅ AI-powered fuzzy matching |
| ❌ No inline editing | ✅ Excel-like click-to-edit |
| ❌ Basic validation only | ✅ Field-level + row-level + custom |
| ❌ No undo/redo | ✅ Full history with Ctrl+Z/Y |
| ❌ Start from scratch | ✅ Production-ready in 5 minutes |

---

## ✨ Features

### 📁 Smart File Handling
- **Drag & drop** or click to upload
- **CSV, TSV, XLS, XLSX** support via SheetJS
- Automatic encoding detection
- File size and type validation
- Beautiful skeleton preview while loading

### 🔄 Intelligent Column Mapping
- **Fuzzy auto-matching** with configurable keywords
- Visual confidence indicators
- Manual override with dropdown selectors
- Required field validation
- Sparkle badges for auto-matched columns ✨

### ✏️ Excel-Like Data Editing
- **Click to edit** any cell
- **Keyboard navigation**: Enter, Escape, Tab, F2
- Inline save/cancel buttons
- Auto-save on blur
- Error and warning highlighting

### 🔍 Powerful Search & Replace
- Real-time search with highlighting
- **Mass find & replace** across all data
- Case-sensitive and whole-word options
- Column-specific filtering
- Live preview of affected cells

### ↩️ Undo/Redo History
- **50-level undo stack**
- Keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
- Visual undo/redo buttons with tooltips

### 📤 Flexible Export
- Export to **CSV or Excel**
- Option to export only valid rows
- Auto-sized columns
- Custom filename support

### 🎨 Beautiful by Default
- Clean, modern design
- **Light and dark mode** support
- Semantic color tokens for easy theming
- Responsive layout
- Accessible (keyboard navigation, ARIA attributes)

---

## 🚀 Quick Start

### Installation

The package is not on a registry yet. Build a tarball from this repository and install it:

```bash
npm pack                              # in this repo: builds dist-lib/ and writes data-weaver-0.1.0.tgz
npm install ../data-weaver/data-weaver-0.1.0.tgz   # in your app
```

### Peer Dependencies

React 18 (`react`, `react-dom`). Everything else ships with the package. Your app does **not** need Tailwind: the stylesheet is precompiled and scoped to the wizard, so it neither needs nor touches your own styles.

### Basic Usage

```tsx
import { ImportWizard } from 'data-weaver';
import 'data-weaver/styles.css';

function App() {
  return (
    <ImportWizard
      fields={[
        { key: 'name', label: 'Name', type: 'string', required: true },
        { key: 'email', label: 'Email', type: 'string' },
        { key: 'age', label: 'Age', type: 'number' },
      ]}
      onComplete={(data, { excludedRows }) => {
        console.log('Imported:', data);
        console.log('Left out by the Importer:', excludedRows.length);
        // Send to your API, update state, etc.
      }}
    />
  );
}
```

That's it! You now have a fully functional data import wizard. 🎉

---

## 📖 Examples

### E-commerce Product Import

```tsx
import { ImportWizard, type FieldConfig } from 'data-weaver';

type ProductField = 'sku' | 'name' | 'price' | 'stock' | 'category';

const productFields: FieldConfig<ProductField>[] = [
  { 
    key: 'sku', 
    label: 'SKU', 
    type: 'string', 
    required: true,
    matchKeywords: ['sku', 'product_id', 'item_code', 'code'],
  },
  { 
    key: 'name', 
    label: 'Product Name', 
    type: 'string', 
    required: true,
    matchKeywords: ['name', 'title', 'product', 'item', 'description'],
  },
  { 
    key: 'price', 
    label: 'Price', 
    type: 'number',
    matchKeywords: ['price', 'cost', 'amount', 'value', 'msrp'],
    validate: (value) => {
      if (value !== null && (value as number) < 0) {
        return { type: 'error', message: 'Price cannot be negative' };
      }
      if (value !== null && (value as number) > 99999) {
        return { type: 'warning', message: 'Unusually high price' };
      }
      return null;
    },
  },
  { 
    key: 'stock', 
    label: 'Stock Quantity', 
    type: 'number',
    matchKeywords: ['stock', 'quantity', 'qty', 'inventory', 'available'],
  },
  { 
    key: 'category', 
    label: 'Category', 
    type: 'string',
    matchKeywords: ['category', 'type', 'department', 'group'],
    transform: (value) => String(value).trim().toLowerCase(),
  },
];

function ProductImport() {
  const handleImport = async (products: Record<ProductField, unknown>[]) => {
    await fetch('/api/products/bulk', {
      method: 'POST',
      body: JSON.stringify(products),
    });
  };

  return (
    <ImportWizard
      fields={productFields}
      requiredFields={['sku', 'name']}
      onComplete={handleImport}
      title="Import Products"
      description="Upload your product catalog as CSV or Excel"
    />
  );
}
```

### User Import with Email Validation

```tsx
import { ImportWizard, type FieldConfig } from 'data-weaver';

const userFields: FieldConfig<'email' | 'name' | 'role' | 'department'>[] = [
  { 
    key: 'email', 
    label: 'Email Address', 
    type: 'string', 
    required: true,
    validate: (value) => {
      const email = String(value);
      if (!email.includes('@') || !email.includes('.')) {
        return { type: 'error', message: 'Invalid email format' };
      }
      return null;
    },
  },
  { key: 'name', label: 'Full Name', type: 'string', required: true },
  { 
    key: 'role', 
    label: 'Role', 
    type: 'string',
    validate: (value) => {
      const validRoles = ['admin', 'user', 'manager', 'viewer'];
      if (value && !validRoles.includes(String(value).toLowerCase())) {
        return { type: 'warning', message: `Unknown role. Valid: ${validRoles.join(', ')}` };
      }
      return null;
    },
  },
  { key: 'department', label: 'Department', type: 'string' },
];

function UserImport() {
  return (
    <ImportWizard
      fields={userFields}
      requiredFields={['email', 'name']}
      onComplete={(users) => console.log(users)}
      validateRow={(data, index) => {
        // Cross-field validation
        if (data.role === 'admin' && !data.department) {
          return [{ type: 'warning', message: 'Admins should have a department' }];
        }
        return [];
      }}
    />
  );
}
```

### Real-Time Progress Tracking

```tsx
import { ImportWizard } from 'data-weaver';
import { useState } from 'react';

function ImportWithProgress() {
  const [progress, setProgress] = useState({ parsed: 0, valid: 0, total: 0 });

  return (
    <>
      <div className="progress-bar">
        Parsed: {progress.parsed}/{progress.total} | Valid: {progress.valid}
      </div>
      
      <ImportWizard
        fields={[/* your fields */]}
        onRowParse={(event) => {
          setProgress(p => ({ ...p, parsed: event.rowIndex + 1 }));
        }}
        onRowComplete={(event) => {
          if (event.isValid) {
            setProgress(p => ({ ...p, valid: p.valid + 1 }));
          }
        }}
        onEvent={(event) => {
          if (event.type === 'FILE_PARSED') {
            setProgress(p => ({ ...p, total: event.data.rows.length }));
          }
        }}
        onComplete={(data) => console.log('Done!', data)}
      />
    </>
  );
}
```

### Custom Styling with CSS Variables

The wizard's theme tokens live on its root element, `.dw-root`. Override them there:

```css
/* your app's CSS, loaded after data-weaver/styles.css */
.dw-root {
  --primary: 260 100% 60%;        /* Purple theme */
  --success: 160 84% 39%;         /* Teal success */
  --step-active: 260 100% 60%;    /* Purple steps */
  --dropzone-active: 260 60% 95%; /* Light purple dropzone */
}
```

---

## 📚 API Reference

### `<ImportWizard />`

The main component that orchestrates the complete 3-step import flow.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fields` | `FieldConfig<TKey>[]` | Required | Column/field configuration array |
| `requiredFields` | `TKey[]` | `[]` | Extra required field keys, on top of fields with `required: true` |
| `onComplete` | `(data: TRecord[], result: ImportResult) => void` | - | Called on "Complete Import" with the records of every row that was not excluded; `result.excludedRows` lists the Excluded Rows. Completing is blocked while an included row is invalid. |
| `onEvent` | `(event: ImportWizardEvent) => void` | - | Lifecycle event handler for all wizard events |
| `onRowParse` | `(event: RowParseEvent) => TRecord \| void` | - | Called for each row during parsing. Return modified data to transform. |
| `onRowComplete` | `(event: RowCompleteEvent) => void` | - | Called when a row passes validation or is edited |
| `validateRow` | `(data, rowIndex) => ValidationResult[]` | - | Custom row-level validation, applied initially and after every edit |
| `aiEdit` | `(request: AiEditRequest) => Promise<RowEdit[]>` | - | Enables AI Edit with your own AI endpoint. Without it, AI Edit is hidden. Only configured fields of existing rows can be changed. |
| `title` | `string` | `'Import Data'` | Title displayed at the top |
| `description` | `string` | - | Optional description below the title |
| `acceptedFileTypes` | `string[]` | `['.csv', '.xlsx', '.xls']` | Accepted file extensions |
| `maxFileSize` | `number` | `10485760` | Maximum file size in bytes (default 10MB) |
| `className` | `string` | - | Additional CSS class for the container |

---

### `FieldConfig<TKey>`

Configuration object for each target field/column.

```typescript
interface FieldConfig<TKey extends string = string> {
  /** Unique identifier for this field */
  key: TKey;
  
  /** Display label shown in the UI */
  label: string;
  
  /** Data type for parsing and validation */
  type: 'string' | 'number' | 'date' | 'boolean';
  
  /** Whether this field is required for a valid row */
  required?: boolean;
  
  /** Keywords for fuzzy auto-matching source columns */
  matchKeywords?: string[];
  
  /** 
   * Custom validation function
   * @returns null if valid, or { type: 'error' | 'warning', message: string }
   */
  validate?: (value: unknown, row: Record<string, unknown>) => ValidationResult | null;
  
  /** Transform value after parsing (e.g., trim, lowercase) */
  transform?: (value: unknown) => unknown;
  
  /** Placeholder shown when value is empty */
  placeholder?: string;
}
```

#### Type Parsing Behavior

| Type | Input Example | Parsed Output |
|------|---------------|---------------|
| `string` | `"  Hello World  "` | `"Hello World"` (trimmed) |
| `number` | `"$1,234.56"` | `1234.56` (symbols stripped) |
| `boolean` | `"yes"`, `"true"`, `"1"` | `true` |
| `date` | `"2024-01-15"` | `Date` object |

---

### Events

#### `ImportWizardEvent<TRecord>`

Union type of all lifecycle events:

```typescript
type ImportWizardEvent<TRecord> =
  | { type: 'FILE_PARSED'; data: ParsedFileData }
  | { type: 'COLUMNS_MAPPED'; mappings: ColumnMapping[] }
  | { type: 'ROW_PARSED'; event: RowParseEvent<TRecord> }
  | { type: 'ROW_COMPLETE'; event: RowCompleteEvent<TRecord> }
  | { type: 'DATA_VALIDATED'; rows: RowValidation<TRecord>[] }
  | { type: 'IMPORT_COMPLETED'; data: TRecord[]; excludedRows: RowValidation<TRecord>[] }
  | { type: 'ERROR'; error: string };
```

#### `RowParseEvent<TRecord>`

Emitted during parsing for each row:

```typescript
interface RowParseEvent<TRecord> {
  rowIndex: number;
  rawData: Record<string, unknown>;  // Original row data
  parsedData: TRecord;               // Parsed & transformed data
}
```

#### `RowCompleteEvent<TRecord>`

Emitted when a row is validated or edited:

```typescript
interface RowCompleteEvent<TRecord> {
  rowIndex: number;
  data: TRecord;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
```

---

### Individual Components

Use these for custom implementations or when you only need specific functionality.

Each step component brings its own `WizardRoot` (styling scope, tooltips and portals), so it works on its own. To compose several building blocks under one scope, wrap them in `<WizardRoot>` yourself.

#### `<FileUploader />`

Drag-and-drop file upload with validation.

```tsx
import { FileUploader } from 'data-weaver';

<FileUploader
  onFileSelected={(file: File) => handleFile(file)}
  isLoading={false}
  error={null}
  helpText="Upload your data file (CSV or Excel)"
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onFileSelected` | `(file: File) => void` | Required | Callback when file is selected |
| `isLoading` | `boolean` | `false` | Show loading skeleton |
| `error` | `string \| null` | `null` | Error message to display |
| `helpText` | `string` | - | Custom help text in info banner |
| `className` | `string` | - | Additional CSS class |

---

#### `<ColumnMapper />`

Column mapping interface with auto-matching.

```tsx
import { ColumnMapper } from 'data-weaver';

<ColumnMapper
  mappings={columnMappings}
  fields={fields}
  onMappingChange={(source, target) => updateMapping(source, target)}
  onConfirm={() => goToValidation()}
  isLoading={false}
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mappings` | `ColumnMapping[]` | Required | Current column mappings |
| `fields` | `FieldConfig[]` | Required | Target field configurations |
| `onMappingChange` | `(source, target) => void` | Required | Callback when mapping changes |
| `onConfirm` | `() => void` | Required | Callback when user confirms mappings |
| `isLoading` | `boolean` | `false` | Show loading skeleton |

---

#### `<DataValidator />`

Data review with editing, search, and export.

```tsx
import { DataValidator } from 'data-weaver';

<DataValidator
  validatedRows={rows}
  fields={fields}
  requiredFields={['name', 'email']}
  onComplete={() => finishImport()}
  onBack={() => goToMapping()}
  onRowsChange={(rows) => setRows(rows)}
  isLoading={false}
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `validatedRows` | `RowValidation[]` | Required | Validated row data |
| `fields` | `FieldConfig[]` | Required | Field configurations |
| `requiredFields` | `string[]` | `[]` | Required field keys |
| `onComplete` | `() => void` | Required | Callback for completion |
| `onBack` | `() => void` | Required | Callback to go back |
| `onRowsChange` | `(rows) => void` | - | Callback when rows change |
| `isLoading` | `boolean` | `false` | Show loading skeleton |

---

#### `<EditableCell />`

Single editable cell with keyboard support.

```tsx
import { EditableCell } from 'data-weaver';

<EditableCell
  value="Cell content"
  onSave={(newValue) => updateCell(newValue)}
  hasError={false}
  hasWarning={false}
  isHighlighted={false}
/>
```

---

#### `<SearchBar />`

Search input with match counter.

```tsx
import { SearchBar } from 'data-weaver';

<SearchBar
  value={searchQuery}
  onChange={setSearchQuery}
  matchCount={5}
/>
```

---

#### `<FindReplaceDialog />`

Find and replace dialog with options.

```tsx
import { FindReplaceDialog } from 'data-weaver';

<FindReplaceDialog
  onReplace={(find, replace, options) => replaceAll(find, replace, options)}
  getPreviewCount={(find, options) => countMatches(find, options)}
  fields={fields}
/>
```

---

### Utility Functions

#### Parsing

```typescript
import { parseFile, isValidFileType, getFileTypeFromName } from 'data-weaver';

// Parse a file
const data = await parseFile(file);
// => { headers: string[], rows: Record<string, unknown>[], fileName: string, fileType: 'csv' | 'excel' }

// Check file type
isValidFileType('data.csv');        // true
isValidFileType('image.png');       // false
getFileTypeFromName('data.xlsx');   // 'excel'
```

#### Column Matching

```typescript
import { autoMatchColumns, updateMapping, getUnmappedTargetFields } from 'data-weaver';

// Auto-match columns
const mappings = autoMatchColumns(headers, fields);

// Update a mapping
const updated = updateMapping(mappings, 'source_col', 'target_field');

// Get unmapped fields
const unmapped = getUnmappedTargetFields(mappings, fields);
```

#### Validation

```typescript
import { validateRows, revalidateRow, getValidationSummary } from 'data-weaver';

// Validate all rows
const validated = validateRows(rows, mappings, {
  fields,
  requiredFields,
  customValidator,
  onRowParse,
});

// Revalidate after editing
const revalidated = revalidateRow(row, { fields, requiredFields });

// Get summary statistics
const summary = getValidationSummary(validated);
// => { total: 100, valid: 95, withErrors: 3, withWarnings: 2 }
```

#### Export

```typescript
import { exportData, exportToBlob } from 'data-weaver';

// Download directly
exportData(rows, fields, {
  filename: 'my-export',
  format: 'xlsx',           // or 'csv'
  onlyValid: true,          // export only valid rows
  includeHeaders: true,
});

// Get blob for custom handling
const blob = exportToBlob(rows, fields, { format: 'csv' });
const url = URL.createObjectURL(blob);
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Click` / `Enter` / `F2` | Start editing cell |
| `Enter` | Save cell and exit edit mode |
| `Escape` | Cancel editing |
| `Tab` | Save cell and move to next |
| `Ctrl+Z` | Undo last change |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+Enter` | Replace all (in Find/Replace dialog) |

---

## 🎨 Customization

### CSS Custom Properties

The library uses CSS custom properties (CSS variables) for theming. Override these in your CSS:

```css
:root {
  /* Core theme colors (HSL values without hsl() wrapper) */
  --primary: 210 100% 50%;
  --primary-foreground: 0 0% 100%;
  
  --success: 142 76% 36%;
  --warning: 38 92% 50%;
  --destructive: 0 72% 51%;
  
  /* Wizard-specific tokens */
  --step-active: 210 100% 45%;
  --step-inactive: 220 10% 60%;
  
  --dropzone-bg: 210 40% 98%;
  --dropzone-border: 210 30% 88%;
  --dropzone-hover: 210 50% 96%;
  --dropzone-active: 210 60% 94%;
  
  --info-bg: 210 100% 97%;
  --info-foreground: 210 100% 40%;
  
  --mapping-matched: 142 50% 95%;
  
  --validation-valid: 142 76% 95%;
  --validation-warning: 38 92% 95%;
  --validation-error: 0 72% 95%;
}
```

### Dark Mode

The library automatically supports dark mode via the `.dark` class:

```css
.dark {
  --primary: 210 100% 60%;
  --dropzone-bg: 220 20% 12%;
  --step-active: 210 100% 60%;
  /* ... see styles.css for all tokens */
}
```

### Component Class Names

Each component accepts a `className` prop for additional styling:

```tsx
<ImportWizard
  className="my-custom-wizard"
  // ...
/>
```

```css
.my-custom-wizard {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
```

---

## 📦 Bundle Size

React Import Wizard is optimized for minimal bundle impact:

| Import | Size (minified + gzipped) |
|--------|---------------------------|
| Full library | ~25 KB |
| Core utils only | ~8 KB |
| xlsx (peer dep) | ~150 KB |

The library uses tree-shaking, so importing only what you need keeps your bundle small:

```typescript
// Full wizard
import { ImportWizard } from 'data-weaver';

// Just utilities (smaller)
import { parseFile, validateRows, exportData } from 'data-weaver';
```

---

## 🧪 Testing

The library includes comprehensive test coverage:

```bash
npm test
```

```
✓ parser.test.ts (9 tests)
✓ matcher.test.ts (16 tests)  
✓ validator.test.ts (18 tests)
✓ exporter.test.ts (8 tests)

Test Files  4 passed
Tests       51 passed
```

---

## 🗺️ Roadmap

- [x] CSV/Excel parsing
- [x] Fuzzy column matching
- [x] Inline cell editing
- [x] Search and find/replace
- [x] Undo/redo history
- [x] CSV/Excel export
- [x] Dark mode support
- [ ] PDF parsing (via AI/LLM)
- [ ] Arrow key navigation between cells
- [ ] Bulk row selection and deletion
- [ ] Column reordering
- [ ] Virtualized rendering for large datasets
- [ ] Saved mapping templates

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT © [Your Organization](https://github.com/your-org)

---

<p align="center">
  <strong>Built with ❤️ for developers who value great UX</strong>
  <br />
  <a href="https://github.com/your-org/react-import-wizard">GitHub</a> •
  <a href="https://npmjs.com/package/react-import-wizard">npm</a> •
  <a href="https://your-org.github.io/react-import-wizard">Demo</a>
</p>
