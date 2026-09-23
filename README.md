# Data Weaver

A React library that lets non-technical people turn messy spreadsheets into clean, validated records. A 3-step wizard: **upload** a file, **match** its columns to your fields, then **review and fix** the rows before handing them to your app.

Data Weaver is general-purpose: the app that embeds it (the **Host App**) defines the fields it accepts. SpeakArt is the first Host App. Vocabulary: [`CONTEXT.md`](CONTEXT.md). Purpose and scope: [`docs/product/2026-09-23-purpose-and-scope.md`](docs/product/2026-09-23-purpose-and-scope.md).

---

## What it does today

### Upload
- Drag and drop, or pick a file: **CSV** (read as UTF-8), **XLSX** and **XLS**, parsed with SheetJS. Only the first sheet of a workbook is read.
- Files of the wrong type or over the size limit are refused with a message. Both limits are configurable (`acceptedFileTypes`, `maxFileSize`).
- A preview of the columns your fields expect.

### Column matching
- Columns are matched to your fields automatically by keyword similarity, using each field's `matchKeywords` (or its key and label when it has none). Auto-matched columns get an "Auto" badge.
- Any match can be changed or cleared from a dropdown.
- Required fields must be matched before continuing.

### Review and edit
- Every row is validated: required fields, type conversion, per-field `validate` functions and a row-level `validateRow`. Errors and warnings are highlighted per row.
- Click a cell to edit it. Enter saves, Escape cancels, and leaving the cell saves. Rows are re-validated after every edit.
- **Choice fields** (e.g. a currency) accept only the options you give, as a list or loaded from your API when the review step opens. Values like `eur` or `Euro` become the option `EUR`; anything else is flagged on the cell, which is edited with a picker of the options.
- Search with highlighting, and find and replace across all columns or one, with case-sensitive and whole-word options and a count of affected cells.
- Undo and redo (up to 50 steps), with buttons and keyboard shortcuts.
- Rows can be **excluded** from the import. The import can't complete while an included row has errors, so every row is either valid or deliberately excluded, and excluded rows are reported to the Host App.
- "Fill Required" fills empty required cells with placeholder values.
- Export the rows (all, or valid only) to CSV or Excel.
- **AI Edit** (optional): the Importer describes a change in plain language and reviews the proposed edits before applying them. It appears only when the Host App supplies its own AI endpoint through `aiEdit`.

### Styling
- Ships its own precompiled stylesheet, scoped to the wizard. Your app does **not** need Tailwind, and the wizard's CSS doesn't touch the rest of your page.
- Themed through CSS custom properties, with light and dark variants.

---

## Quick start

### Installation

The package is not on a registry yet. Build a tarball from this repository and install it:

```bash
npm pack                                           # in this repo: builds dist-lib/ and writes data-weaver-0.1.0.tgz
npm install ../data-weaver/data-weaver-0.1.0.tgz   # in your app
```

Peer dependencies: React 18 (`react`, `react-dom`). Everything else ships with the package.

### Basic usage

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
      }}
    />
  );
}
```

The framework-free logic (parsing, matching, validation, export) is also available on its own from `data-weaver/core`.

---

## Examples

### Product import

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
      onComplete={handleImport}
      title="Import products"
      description="Upload your product catalogue as a CSV or Excel file."
      acceptedFileTypes={['.csv', '.xlsx']}
      maxFileSize={5 * 1024 * 1024}
    />
  );
}
```

### Cross-field validation

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
      onComplete={(users) => console.log(users)}
      validateRow={(data) => {
        if (data.role === 'admin' && !data.department) {
          return [{ type: 'warning', message: 'Admins should have a department' }];
        }
        return [];
      }}
    />
  );
}
```

### Tracking progress

`onRowComplete` fires once per row when the review step opens, then again for each row the Importer edits. Key your state by `rowIndex` so edits update the count instead of adding to it.

```tsx
import { ImportWizard } from 'data-weaver';
import { useState } from 'react';

function ImportWithProgress() {
  const [total, setTotal] = useState(0);
  const [validRows, setValidRows] = useState<Set<number>>(new Set());

  return (
    <>
      <p>
        Valid: {validRows.size} / {total}
      </p>

      <ImportWizard
        fields={[/* your fields */]}
        onEvent={(event) => {
          if (event.type === 'FILE_PARSED') setTotal(event.data.rows.length);
        }}
        onRowComplete={(event) => {
          setValidRows((prev) => {
            const next = new Set(prev);
            if (event.isValid) next.add(event.rowIndex);
            else next.delete(event.rowIndex);
            return next;
          });
        }}
        onComplete={(data) => console.log('Done', data)}
      />
    </>
  );
}
```

### AI Edit

AI Edit is off unless you pass `aiEdit`, a function that calls **your own** AI endpoint. Data Weaver sends the instruction, the rows and the field definitions, and expects back the edits to propose. The Importer reviews them before they are applied, and only configured fields of existing rows can change.

```tsx
import { ImportWizard, type AiEditHandler } from 'data-weaver';

const aiEdit: AiEditHandler = async ({ command, rows, fields }) => {
  const response = await fetch('/api/ai-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, rows, fields }),
  });
  if (!response.ok) throw new Error('The AI service is unavailable. Try again later.');
  return response.json(); // RowEdit[]: [{ rowIndex: 0, changes: { email: 'ada@example.com' } }]
};

<ImportWizard fields={fields} aiEdit={aiEdit} onComplete={save} />;
```

Each entry of `fields` has the field's `key`, `label` and `type`; choice fields also carry their loaded `options`, so your endpoint can propose accepted values. Proposed values are matched to options the same way as cells read from the file.

A rejected promise's `Error` message is shown to the Importer. Your endpoint is responsible for authentication, rate limiting and validating what it receives.

---

## API reference

### `<ImportWizard />`

The complete 3-step flow.

| Prop                | Type                                              | Default                     | Description |
| ------------------- | ------------------------------------------------- | --------------------------- | ----------- |
| `fields`            | `FieldConfig<TKey>[]`                             | artwork fields              | The fields each row becomes. Without it, the demo's artwork fields are used. |
| `requiredFields`    | `TKey[]`                                          | `[]`                        | Extra required field keys, on top of fields with `required: true`. |
| `onComplete`        | `(data: TRecord[], result: ImportResult) => void` | -                           | Called on "Complete Import" with the records of every row that was not excluded; `result.excludedRows` lists the Excluded Rows. Completing is blocked while an included row is invalid. |
| `onEvent`           | `(event: ImportWizardEvent) => void`              | -                           | Called for every lifecycle event. |
| `onRowParse`        | `(event: RowParseEvent) => TRecord \| void`       | -                           | Called for each row as it is converted to a record. Return a record to replace it. |
| `onRowComplete`     | `(event: RowCompleteEvent) => void`               | -                           | Called for each row when the review step opens, then for each edited row. |
| `validateRow`       | `(data, rowIndex) => ValidationResult[]`          | -                           | Row-level validation, applied initially and after every edit. |
| `aiEdit`            | `(request: AiEditRequest) => Promise<RowEdit[]>`  | -                           | Enables AI Edit with your own AI endpoint. Without it, AI Edit is hidden. |
| `title`             | `string`                                          | none                        | Heading shown above the step indicator. |
| `description`       | `string`                                          | none                        | Text shown above the step indicator, below the title. |
| `acceptedFileTypes` | `string[]`                                        | `['.csv', '.xlsx', '.xls']` | Extensions the upload step accepts; must be a subset of the default. Also sets the file picker's filter and the "You can upload" line. |
| `maxFileSize`       | `number`                                          | `10485760` (10 MB)          | Largest file, in bytes, the upload step accepts. |
| `className`         | `string`                                          | -                           | Extra CSS class for the wizard's root element. |

**No default heading.** The wizard is usually placed inside a page that already has its own heading, so it shows no title unless you pass `title` (and no description unless you pass `description`).

**Refused files.** A file with another extension, or larger than `maxFileSize`, is refused before it is read. The upload step stays open and shows, for example, "catalogue.pdf is not a supported file type. You can upload: .csv, .xlsx, .xls" or "people.csv is too large. The maximum file size is 10 MB."

### `FieldConfig<TKey>`

```typescript
interface FieldConfig<TKey extends string = string> {
  /** Unique identifier for this field */
  key: TKey;
  /** Label shown in the UI */
  label: string;
  /** Whether a row must have a value for this field to be valid */
  required?: boolean;
  /** How the cell text is converted (see below) */
  type: 'string' | 'number' | 'date' | 'boolean' | 'choice';
  /** For `date` fields: read 01/02/2024 day-first ('DMY', default) or month-first ('MDY') */
  dateOrder?: 'DMY' | 'MDY';
  /** For `choice` fields: the accepted options, or a loader called once when the review step opens */
  options?: ChoiceOption[] | (() => Promise<ChoiceOption[]>);
  /** Keywords used to auto-match source column names to this field */
  matchKeywords?: string[];
  /** Field-level validation: null if valid, otherwise an error or warning */
  validate?: (value: unknown, row: Record<string, unknown>) => ValidationResult | null;
  /** Transform the value after conversion (e.g. trim, lowercase) */
  transform?: (value: unknown) => unknown;
  /** Placeholder shown when the value is empty */
  placeholder?: string;
}

interface ChoiceOption {
  /** The canonical value your app receives, e.g. 'EUR' */
  value: string;
  /** What the Importer sees in the picker, e.g. 'Euro'. Defaults to `value`. */
  label?: string;
}
```

#### Type conversion

Empty cells become `null`.

| Type      | Input example                                        | Result                                     |
| --------- | ---------------------------------------------------- | ------------------------------------------ |
| `string`  | `"  Hello World  "`                                  | `"Hello World"` (trimmed)                  |
| `number`  | `"$1,234.56"`                                        | `1234.56` (`, $ € £ ¥` and spaces removed) |
| `boolean` | `"yes"`, `"true"`, `"1"`, `"on"` / `"no"`, `"false"`, `"0"`, `"off"` | `true` / `false`       |
| `date`    | `"15/01/2024"`, `"2024-01-15"`                       | `Date` at midnight UTC of 15 January 2024 (see below) |
| `choice`  | `"eur"`, `" Euro "` (with an option `{ value: 'EUR', label: 'Euro' }`) | `"EUR"`, the option's `value` (see below) |

#### Dates

A date field holds a calendar day, and every Importer gets the same day whatever their computer's time zone. It reaches the Host App as a `Date` at midnight UTC of that day: read it with `getUTCFullYear()`, `getUTCMonth()` and `getUTCDate()` (or `toISOString().slice(0, 10)`), never with the local-time getters. Nothing is parsed in local time.

| Cell text                                              | Read as                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| `2024-01-15`, `2024/01/15`, `2024.01.15`               | Year-month-day, always                                               |
| `2024-01-15T23:30:00Z`, `2024-01-15 10:30`             | The day written (15 January); the time and any offset are ignored     |
| `15/01/2024`, `15.01.2024`, `15-01-2024`, `5/1/2024`   | **Day first** (15 January, 5 January)                                |
| `01/02/2024`                                           | **1 February 2024**; with `dateOrder: 'MDY'`, 2 January 2024          |
| Excel date cells                                       | The day the cell holds, whatever its display format or locale        |
| Empty cell                                             | `null`                                                               |
| `31/02/2024`, `15/01/24`, `Jan 15 2024`, anything else | A cell error: *"… is not a valid date (use DD/MM/YYYY or YYYY-MM-DD)"* |

Ambiguous numeric dates are read **day-first** by default, as written by the Importers of the first Host App (Italian gallery and archive staff). Set `dateOrder: 'MDY'` on a field whose spreadsheets are written month-first. Numeric dates need a four-digit year: `15/01/24` could be 1924 or 2024, so it is flagged rather than guessed. A date that can't be read is never shifted or silently emptied: the cell keeps its text, shows the error, and is fixed by editing it.

To check dates under other time zones, run `npm run test:tz` (the test suite in `America/New_York` and `Asia/Tokyo`).

#### Choice fields

A choice field accepts only the values your app accepts, such as a currency or a status. Give its `options` as a list, or as a loader that fetches them from your API so they never drift from what your backend accepts:

```tsx
import { ImportWizard, type FieldConfig } from 'data-weaver';

type ArtworkField = 'title' | 'valueCurrency' | 'status';

const fields: FieldConfig<ArtworkField>[] = [
  { key: 'title', label: 'Title', type: 'string', required: true },
  {
    key: 'valueCurrency',
    label: 'Currency',
    type: 'choice',
    matchKeywords: ['currency', 'valuta'],
    // Loaded once, when the review step opens
    options: async () => {
      const response = await fetch('/api/currencies');
      if (!response.ok) throw new Error('The currency list is unavailable.');
      const currencies: Array<{ code: string; name: string }> = await response.json();
      return currencies.map((c) => ({ value: c.code, label: c.name })); // { value: 'EUR', label: 'Euro' }
    },
  },
  {
    key: 'status',
    label: 'Status',
    type: 'choice',
    options: [
      { value: 'IN_COLLECTION', label: 'In collection' },
      { value: 'ON_LOAN', label: 'On loan' },
      { value: 'SOLD' },
    ],
  },
];

<ImportWizard fields={fields} onComplete={save} />;
```

- **Matching.** A cell becomes an option's `value` when it is a Normalised Match of that option's `value` or `label`: equal once case, accents and extra spaces are ignored. With the options above, `eur`, `EUR ` and `euro` all become `EUR`, and `on loan` becomes `ON_LOAN`. A value that matches an option's `value` wins over one that matches another option's `label`; a value that matches several options equally is not guessed.
- **Anything else** is an error on that cell, e.g. *"Currency must be one of: Euro, US dollar, Pound sterling and 12 more"*. The cell keeps its text until the Importer fixes it.
- **Empty cells** stay empty (`null`). Set `required: true` to require a value.
- **Editing.** Choice cells are edited with a picker listing the options (showing each `label`, with its `value` beside it). Find and replace and AI Edit results are matched the same way as cells read from the file.
- **Loading.** Loaders are called once each, in parallel, when the Importer continues from column matching to the review step (and again if they go back and continue again). The review shows a loading state until every loader resolves. If a loader rejects, its `Error` message is shown with a "Try again" button, an `ERROR` event is emitted, and the import can't be completed until the options load.
- **Column matching** is unaffected: a choice field is matched to a column by its `matchKeywords`, like any other field.

Your app receives the canonical `value` (a `string`), never the label or the Importer's spelling.

### Events

```typescript
type ImportWizardEvent<TRecord> =
  | { type: 'FILE_PARSED'; data: ParsedFileData }
  | { type: 'COLUMNS_MAPPED'; mappings: ColumnMapping[] }
  | { type: 'ROW_PARSED'; event: RowParseEvent<TRecord> }
  | { type: 'ROW_COMPLETE'; event: RowCompleteEvent<TRecord> }
  | { type: 'DATA_VALIDATED'; rows: RowValidation<TRecord>[] }
  | { type: 'IMPORT_COMPLETED'; data: TRecord[]; excludedRows: RowValidation<TRecord>[] }
  | { type: 'ERROR'; error: string };

interface RowParseEvent<TRecord> {
  rowIndex: number;
  rawData: Record<string, unknown>; // the row as read from the file
  parsedData: TRecord;              // after type conversion and transforms
}

interface RowCompleteEvent<TRecord> {
  rowIndex: number;
  data: TRecord;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
```

`ERROR` is emitted when a file that passed the upload checks can't be parsed, and when a choice field's options fail to load.

### Individual components

Use these to build your own flow. Each step component brings its own `WizardRoot` (styling scope, tooltip context and a container for popovers), so it works on its own. To compose several pieces under one scope, wrap them in `<WizardRoot>` yourself.

#### `<FileUploader />`

```tsx
<FileUploader
  onFileSelected={(file) => handleFile(file)}
  acceptedFileTypes={['.csv']}
  maxFileSize={2 * 1024 * 1024}
/>
```

| Prop                | Type                                   | Default                     | Description |
| ------------------- | -------------------------------------- | --------------------------- | ----------- |
| `onFileSelected`    | `(file: File) => void`                 | Required                    | Called with a file that passed the type and size checks. |
| `acceptedFileTypes` | `string[]`                             | `['.csv', '.xlsx', '.xls']` | Accepted extensions. Other files are refused with a message. |
| `maxFileSize`       | `number`                               | `10485760` (10 MB)          | Largest accepted file, in bytes. |
| `fields`            | `Pick<FieldConfig, 'key' \| 'label'>[]` | artwork fields              | Columns shown in the preview. |
| `helpText`          | `string`                               | a one-line explanation      | Plain text shown in the info banner. |
| `isLoading`         | `boolean`                              | `false`                     | Show a loading skeleton. |
| `error`             | `string \| null`                       | `null`                      | Error to display, e.g. from parsing. |
| `className`         | `string`                               | -                           | Extra CSS class. |

#### `<ColumnMapper />`

```tsx
<ColumnMapper
  mappings={columnMappings}
  fields={fields}
  onMappingChange={(source, target) => setMappings(updateMapping(columnMappings, source, target))}
  onConfirm={() => goToReview()}
/>
```

| Prop              | Type                                               | Default  | Description |
| ----------------- | -------------------------------------------------- | -------- | ----------- |
| `mappings`        | `ColumnMapping[]`                                  | Required | Current column mappings. |
| `fields`          | `FieldConfig[]`                                    | Required | Target fields. |
| `onMappingChange` | `(sourceColumn: string, targetField: TKey \| null) => void` | Required | Called when a mapping changes. |
| `onConfirm`       | `() => void`                                       | Required | Called when the Importer confirms the mappings. |
| `isLoading`       | `boolean`                                          | `false`  | Show a loading skeleton. |
| `className`       | `string`                                           | -        | Extra CSS class. |

#### `<DataValidator />`

```tsx
<DataValidator
  validatedRows={rows}
  fields={fields}
  onRowsChange={setRows}
  onComplete={() => finishImport()}
  onBack={() => goToMapping()}
/>
```

| Prop             | Type                                     | Default  | Description |
| ---------------- | ---------------------------------------- | -------- | ----------- |
| `validatedRows`  | `RowValidation[]`                        | Required | Validated rows. |
| `fields`         | `FieldConfig[]`                          | Required | Fields. Choice fields need their options as a list here: resolve loaders first with `loadChoiceOptions(fields)`, and validate the rows with the same fields. |
| `requiredFields` | `TKey[]`                                 | `[]`     | Extra required field keys. |
| `validateRow`    | `(data, rowIndex) => ValidationResult[]` | -        | Row-level validation, re-applied after every edit. |
| `aiEdit`         | `AiEditHandler`                          | -        | Enables AI Edit. |
| `onComplete`     | `() => void`                             | Required | Called on "Complete Import". |
| `onBack`         | `() => void`                             | Required | Called on "Back". |
| `onRowsChange`   | `(rows: RowValidation[]) => void`        | -        | Called after each change to the rows (not on mount). |
| `isLoading`      | `boolean`                                | `false`  | Show a loading skeleton. |
| `className`      | `string`                                 | -        | Extra CSS class. |

#### Smaller pieces

- `<EditableCell value onSave hasError? hasWarning? isHighlighted? />`: a click-to-edit cell.
- `<ChoiceCell value options onSave aria-label hasError? hasWarning? message? isHighlighted? />`: a choice field's cell, edited with a picker of its options. Render it inside a `WizardRoot` so the picker is styled.
- `<SearchBar value onChange matchCount? />`: a search input with a match counter.
- `<FindReplaceDialog onReplace getPreviewCount fields? />`: find and replace, with column, case-sensitive and whole-word options.
- `<AiEditChat rows fields onRequestEdits onApplyEdits />`: the AI Edit chat on its own.

### Utility functions

All of these are exported from `data-weaver` and from `data-weaver/core`.

#### Upload checks and parsing

```typescript
import { checkUpload, parseFile, isValidFileType, getFileTypeFromName } from 'data-weaver';

checkUpload(file, { acceptedFileTypes: ['.csv'], maxFileSize: 10 * 1024 * 1024 });
// => null if accepted, otherwise the message shown to the Importer

const data = await parseFile(file); // .csv, .xlsx or .xls; throws on anything else
// => { headers: string[], rows: Record<string, unknown>[], fileName: string, fileType: 'csv' | 'excel' }

isValidFileType('data.csv');      // true
isValidFileType('report.pdf');    // false
getFileTypeFromName('data.xlsx'); // 'excel'
```

`DEFAULT_ACCEPTED_FILE_TYPES` and `DEFAULT_MAX_FILE_SIZE` hold the defaults.

#### Column matching

```typescript
import { autoMatchColumns, updateMapping, getUnmappedTargetFields } from 'data-weaver';

const mappings = autoMatchColumns(headers, fields);             // keyword-similarity matching
const updated = updateMapping(mappings, 'source_col', 'target_field');
const unmapped = getUnmappedTargetFields(mappings, fields);
```

#### Validation

```typescript
import { validateRows, revalidateRow, getValidationSummary, resolveRequiredKeys } from 'data-weaver';

const validated = validateRows(rows, mappings, { fields, requiredFields, customValidator, onRowParse });
const revalidated = revalidateRow(row, { fields, requiredFields, customValidator });

getValidationSummary(validated);
// => { total, valid, withErrors, withWarnings, excluded }

resolveRequiredKeys(fields, requiredFields); // the field keys a row must fill in
```

Validating choice fields needs their options as a list. If any are loaders, load them first and validate with the result:

```typescript
import { hasOptionLoaders, loadChoiceOptions, validateRows } from 'data-weaver';

const loadedFields = hasOptionLoaders(fields) ? await loadChoiceOptions(fields) : fields;
// Calls each loader once; rejects with "Could not load the options for Currency: …"
const validated = validateRows(rows, mappings, { fields: loadedFields });
```

A choice field whose options are still a loader flags every value (*"The options for Currency are not loaded"*) rather than accepting it.

#### Normalised Match

```typescript
import { normaliseForMatch, isNormalisedMatch, matchChoice } from 'data-weaver';

normaliseForMatch(' Niccolò  MACHIAVELLI '); // 'niccolo machiavelli'
isNormalisedMatch('Niccolò', 'niccolo ');     // true
isNormalisedMatch('Fontana, Lucio', 'Lucio Fontana'); // false: word order and punctuation count

matchChoice('euro', [{ value: 'EUR', label: 'Euro' }]); // 'EUR' (null when nothing matches)
```

The rule, in order: Unicode canonical decomposition (NFD), remove combining marks (accents), lowercase, collapse every run of whitespace (including non-breaking spaces) to one space, trim. If your backend compares values too, apply the same rule; in Python:

```python
" ".join("".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.category(c).startswith("M")).lower().split())
```

#### Export

```typescript
import { exportData, exportToBlob } from 'data-weaver';

// Download a file
exportData(rows, fields, {
  filename: 'my-export', // default 'export'
  format: 'xlsx',        // or 'csv'
  onlyValid: true,       // default false
  includeHeaders: true,
});

// Or get a Blob to handle yourself
const blob = exportToBlob(rows, fields, { format: 'csv' });
```

`data-weaver` (not `data-weaver/core`) also exports `useHistory`, the undo/redo hook the review step uses.

---

## Keyboard shortcuts

| Shortcut                 | Action                               |
| ------------------------ | ------------------------------------ |
| Click / `Enter` / `F2`   | Start editing a cell                 |
| `Enter`                  | Save the cell                        |
| `Escape`                 | Cancel editing                       |
| `Tab`                    | Save the cell                        |
| `Ctrl+Z` / `Cmd+Z`       | Undo                                 |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo                           |
| `Ctrl+Y` / `Cmd+Y`       | Redo                                 |
| `Ctrl+Enter`             | Replace all (in the Find and Replace dialog) |

Undo and redo apply to the grid. While you type in a text field (a cell, the search box, AI Edit, Find and Replace) they undo your typing instead.

---

## Theming

All tokens live on the wizard's root element, `.dw-root`, as HSL values without the `hsl()` wrapper. Override them in your own CSS, loaded after `data-weaver/styles.css`:

```css
.dw-root {
  --primary: 260 100% 60%;
  --step-active: 260 100% 60%;
  --dropzone-active: 260 60% 95%;
}
```

The main tokens are `--primary`, `--success`, `--warning`, `--destructive`, `--step-active`, `--step-inactive`, `--dropzone-*`, `--info-*`, `--mapping-*` and `--validation-*`. See `src/components/import-wizard/styles.css` for the full list.

**Dark mode** applies when the wizard is inside an element with the `dark` class (e.g. `<html class="dark">`). Override dark tokens with `.dark .dw-root { ... }`.

Every component also accepts a `className` for layout tweaks.

---

## Developing

```bash
npm run dev         # demo app on http://localhost:8080
npm test            # run the tests once
npm run lint        # ESLint
npm run build       # demo site build (GitHub Pages)
npm run build:lib   # package build into dist-lib/
```

The demo app (`src/pages/Index.tsx`) is an artwork importer. It is deployed to GitHub Pages by `.github/workflows/deploy.yml`.

## Planned

From the [purpose and scope](docs/product/2026-09-23-purpose-and-scope.md): resolving Relationship Fields to existing records before Commit, Commit in batches with per-row outcomes, an Import Report, Fix & Retry, a message catalogue for translations, and a grid that stays fast with 10,000 rows.

## License

No license has been chosen yet.
