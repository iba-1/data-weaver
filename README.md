# Data Weaver

A React library that lets non-technical people turn messy spreadsheets into clean, validated records. A wizard: **upload** a file, **match** its columns to your fields, **review and fix** the rows, then **import** them: Data Weaver saves them through your app in batches and shows an **Import Report** of what was imported, rejected and excluded.

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

### Import (Commit) and the Import Report
- Data Weaver saves the rows itself, through a small adapter your app supplies: `saveBatch(rows)`. Rows are sent in batches (100 by default, `batchSize` to change it), one batch at a time. Excluded Rows are never sent.
- Every row carries an **Import Key**, so your app can recognise a row it has already saved and not save it twice. Your app answers each batch with one outcome per row: created, or rejected with a reason and, when known, the field. See [The Host App adapter](#the-host-app-adapter).
- The Importer sees the progress while rows are saved; the review can't be changed meanwhile.
- Afterwards, the **Import Report** shows how many rows were imported, rejected and excluded, each Rejected Row with its row number, your reason and the field, and the Excluded Rows as a separate list. Your app receives the same report through `onImportFinished`.
- The Importer can download the Rejected Rows as a spreadsheet (the file's own columns plus an error column) to fix and import again. The report is not kept, so leaving while it shows Rejected Rows asks for confirmation. See [Leaving with Rejected Rows](#leaving-with-rejected-rows).

### Language
- Every piece of text the Importer sees comes from a message catalogue. English is built in. Your app passes its own entries for the Importer's language, and anything it leaves out falls back to English. See [Messages and translation](#messages-and-translation).

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
import { ImportWizard, type HostAppAdapter } from 'data-weaver';
import 'data-weaver/styles.css';

type Person = { name: string | null; email: string | null; age: number | null };

// Your save function: see "The Host App adapter" for the contract
const adapter: HostAppAdapter<Person> = {
  saveBatch: async (rows) => {
    const response = await fetch('/api/people/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows), // [{ importKey, rowIndex, record }, ...]
    });
    if (!response.ok) throw new Error(`Import failed: ${response.status}`);
    return response.json(); // [{ importKey, status: 'created' } | { importKey, status: 'rejected', reason, field? }, ...]
  },
};

function App() {
  return (
    <ImportWizard<Person, keyof Person>
      fields={[
        { key: 'name', label: 'Name', type: 'string', required: true },
        { key: 'email', label: 'Email', type: 'string' },
        { key: 'age', label: 'Age', type: 'number' },
      ]}
      adapter={adapter}
      onImportFinished={(report) => {
        console.log('Imported:', report.created.length);
        console.log('Rejected:', report.rejected.length);
        console.log('Left out by the Importer:', report.excluded.length);
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
  return (
    <ImportWizard
      fields={productFields}
      adapter={productsAdapter} // your saveBatch, as in Basic usage
      batchSize={50}
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
      adapter={usersAdapter}
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
        adapter={adapter}
        onImportFinished={(report) => console.log('Done', report)}
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

<ImportWizard fields={fields} adapter={adapter} aiEdit={aiEdit} />;
```

Each entry of `fields` has the field's `key`, `label` and `type`; choice fields also carry their loaded `options`, so your endpoint can propose accepted values. Proposed values are matched to options the same way as cells read from the file.

A rejected promise's `Error` message is shown to the Importer. Your endpoint is responsible for authentication, rate limiting and validating what it receives.

---

## API reference

### `<ImportWizard />`

The complete flow: upload, column matching, review, Commit and the Import Report.

| Prop                | Type                                              | Default                     | Description |
| ------------------- | ------------------------------------------------- | --------------------------- | ----------- |
| `fields`            | `FieldConfig<TKey>[]`                             | artwork fields              | The fields each row becomes. Without it, the demo's artwork fields are used. |
| `requiredFields`    | `TKey[]`                                          | `[]`                        | Extra required field keys, on top of fields with `required: true`. |
| `adapter`           | `HostAppAdapter<TRecord>`                         | Required                    | How rows are saved: `{ saveBatch }`. See [The Host App adapter](#the-host-app-adapter). The import can't start while an included row is invalid. |
| `batchSize`         | `number`                                          | `100`                       | Most rows per `saveBatch` call. Values below 1 fall back to the default; fractions are rounded down. |
| `onImportFinished`  | `(report: ImportReport<TRecord>) => void`         | -                           | Called once when Commit is over, with the Import Report. |
| `onLeaveWarningChange` | `(warn: boolean) => void`                      | -                           | `true` while leaving should be confirmed (the Import Report shows Rejected Rows), `false` after. Guard your router with it. See [Leaving with Rejected Rows](#leaving-with-rejected-rows). |
| `onEvent`           | `(event: ImportWizardEvent) => void`              | -                           | Called for every lifecycle event. |
| `onRowParse`        | `(event: RowParseEvent) => TRecord \| void`       | -                           | Called for each row as it is converted to a record. Return a record to replace it. |
| `onRowComplete`     | `(event: RowCompleteEvent) => void`               | -                           | Called for each row when the review step opens, then for each edited row. |
| `validateRow`       | `(data, rowIndex) => ValidationResult[]`          | -                           | Row-level validation, applied initially and after every edit. |
| `aiEdit`            | `(request: AiEditRequest) => Promise<RowEdit[]>`  | -                           | Enables AI Edit with your own AI endpoint. Without it, AI Edit is hidden. |
| `title`             | `string`                                          | none                        | Heading shown above the step indicator. |
| `description`       | `string`                                          | none                        | Text shown above the step indicator, below the title. |
| `acceptedFileTypes` | `string[]`                                        | `['.csv', '.xlsx', '.xls']` | Extensions the upload step accepts; must be a subset of the default. Also sets the file picker's filter and the "You can upload" line. |
| `maxFileSize`       | `number`                                          | `10485760` (10 MB)          | Largest file, in bytes, the upload step accepts. |
| `messages`          | `PartialMessageCatalogue`                         | English                     | Text in the Importer's language; missing entries fall back to English. See [Messages and translation](#messages-and-translation). |
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

<ImportWizard fields={fields} adapter={adapter} />;
```

- **Matching.** A cell becomes an option's `value` when it is a Normalised Match of that option's `value` or `label`: equal once case, accents and extra spaces are ignored. With the options above, `eur`, `EUR ` and `euro` all become `EUR`, and `on loan` becomes `ON_LOAN`. A value that matches an option's `value` wins over one that matches another option's `label`; a value that matches several options equally is not guessed.
- **Anything else** is an error on that cell, e.g. *"Currency must be one of: Euro, US dollar, Pound sterling and 12 more"*. The cell keeps its text until the Importer fixes it.
- **Empty cells** stay empty (`null`). Set `required: true` to require a value.
- **Editing.** Choice cells are edited with a picker listing the options (showing each `label`, with its `value` beside it). Find and replace and AI Edit results are matched the same way as cells read from the file.
- **Loading.** Loaders are called once each, in parallel, when the Importer continues from column matching to the review step (and again if they go back and continue again). The review shows a loading state until every loader resolves. If a loader rejects, its `Error` message is shown with a "Try again" button, an `ERROR` event is emitted, and the import can't be completed until the options load.
- **Column matching** is unaffected: a choice field is matched to a column by its `matchKeywords`, like any other field.

Your app receives the canonical `value` (a `string`), never the label or the Importer's spelling.

### The Host App adapter

Data Weaver owns the import: when the Importer imports, it sends the rows to your `saveBatch` and shows the outcome. Your app only owns persistence. The contract ([ADR-0002](docs/adr/0002-host-apps-must-honour-import-keys.md)):

```typescript
interface HostAppAdapter<TRecord> {
  saveBatch: (rows: ImportRow<TRecord>[]) => Promise<RowOutcome[]>;
}

interface ImportRow<TRecord> {
  importKey: string; // Data Weaver's unique ID for the row, the same on every attempt to save it
  rowIndex: number;  // the row's position among the file's data rows, from 0 (the Importer sees rowIndex + 1)
  record: TRecord;   // the reviewed record
}

type RowOutcome =
  | { importKey: string; status: 'created' }
  | { importKey: string; status: 'rejected'; reason: string; field?: string };
```

Your `saveBatch` must:

1. **Answer every row exactly once**, matched by `importKey` (in any order): `created`, or `rejected` with a `reason` the Importer can act on, in their language, and the `field` key at fault when you know it. Save every row you can; one bad row must not stop the others.
2. **Honour Import Keys.** If a row's `importKey` was already saved, don't save it again: answer `created`. This makes sending a row again always safe.
3. **Only create.** A Commit never updates existing records (reject a row that would duplicate one, with a reason).
4. **Reject the promise** (throw) only when nothing is known about the batch, e.g. a network error.

What Data Weaver does with the answer:

- Batches are sent one at a time, in file order, `batchSize` rows each (default 100). The next batch is sent when the previous one has its answer.
- A row counts as imported **only** with exactly one valid `created` outcome for its key. A row with no outcome, several outcomes or an unknown status is an adapter bug: it becomes a Rejected Row (*"No clear answer was received for this row, so it was not counted as imported."*), and the problem is logged with `console.error` for your developers. Outcomes for keys that weren't in the batch are ignored (and logged). A rejection without a reason is shown with `commit.noReason`.
- A batch whose promise rejects is not retried yet: its rows become Rejected Rows (*"This row could not be sent. Try importing it again later."*) and the next batch is sent.

**Import Keys** are random UUIDs (`crypto.randomUUID`, or built from `crypto.getRandomValues` where that isn't available, e.g. on pages not served over HTTPS). One is made for each data row when the file is parsed, and stays tied to that row of the file for the whole import: editing, undo and redo, excluding and including, and going back to column matching (which validates the file's rows again) all keep it. Uploading a file, even the same one, makes new keys. Store the key with each saved record, or in a table of keys already imported, and check it before saving.

### The Import Report

After Commit, the Importer sees the counts (*"785 imported · 12 rejected · 3 excluded"*), the Rejected Rows (row number, the value of your first field, the field at fault and the reason) and, separately, the Excluded Rows. `onImportFinished` receives the same report:

```typescript
interface ImportReport<TRecord> {
  created: ImportRow<TRecord>[];     // saved by your app
  rejected: RejectedRow<TRecord>[];  // not saved, with the reason
  excluded: ImportRow<TRecord>[];    // left out by the Importer, never sent
}

interface RejectedRow<TRecord> extends ImportRow<TRecord> {
  reason: string;  // your reason as given, or Data Weaver's (from the message catalogue)
  field?: string;  // the field key you gave
  cause: 'host' | 'notSent' | 'invalidAnswer'; // rejected by you, batch not sent, or no valid outcome
}
```

Every row of the file is in exactly one list, in file order. The report is not kept after the Importer leaves.

#### Downloading the Rejected Rows

When there are Rejected Rows, the report offers **Download rejected rows**: a spreadsheet the Importer can fix in Excel (or hand to a colleague) and upload again.

- **Columns:** the uploaded file's own columns, in its order and under its own headers, including the columns that were not imported. Last comes an **Error** column: the reason, preceded by the field's label when your app gave one (*"Title: Already in the collection"*).
- **Cells:** each cell as it was uploaded, except the fields the Importer edited in review before importing: those are written, as text, into the column they came from (dates as `YYYY-MM-DD`, choices as their `value`). A field that no column fed but that the Importer filled in gets its own column after the file's, headed by the field's label. So the file holds exactly what the Importer would need to import those rows again.
- **Rows:** only the Rejected Rows, in file order.
- **Format:** Excel (`.xlsx`) whenever `acceptedFileTypes` includes it, with every cell stored as text so Excel keeps leading zeros and doesn't re-read dates. If your upload step doesn't accept `.xlsx`, the file is CSV (UTF-8, readable by Excel), or `.xls` if that is all it accepts, so it can always be uploaded again.
- **Names:** the file is `report.downloadFileName` (by default *"artworks - rejected rows.xlsx"* for `artworks.csv`), the sheet `report.downloadSheetName`, the error column's header `report.downloadErrorHeader`.

#### Leaving with Rejected Rows

Because the report is not kept, leaving the wizard while it shows Rejected Rows asks the Importer to confirm. No confirmation is asked when there are none.

- **Closing or reloading the tab** is guarded by the wizard itself, with the browser's own `beforeunload` prompt (browsers show their own text).
- **Navigation inside your app** can't be blocked by Data Weaver, since it doesn't own your router. The wizard calls `onLeaveWarningChange(true)` when leaving should be confirmed and `onLeaveWarningChange(false)` when that is over, including when it unmounts. Guard your router with it. With React Router's `useBlocker` (it needs a data router, e.g. `createBrowserRouter`):

```tsx
import { useBlocker } from 'react-router-dom';

function ImportPage() {
  const [warnOnLeave, setWarnOnLeave] = useState(false);
  const blocker = useBlocker(warnOnLeave);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Some rows were not imported and this report will be lost. Leave anyway?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  return <ImportWizard fields={fields} adapter={adapter} onLeaveWarningChange={setWarnOnLeave} />;
}
```

**If the wizard is unmounted during Commit** (the Importer navigates away), no further batch is sent and `onImportFinished` is not called. A batch already sent may have been saved; its rows keep their Import Keys, so importing the same file again cannot duplicate them.

**Your callbacks cannot break an import.** If `onEvent`, `onRowComplete` or `onImportFinished` throws, the error is logged with `console.error` (prefixed `[data-weaver]`) and the wizard carries on.

### Events

```typescript
type ImportWizardEvent<TRecord> =
  | { type: 'FILE_PARSED'; data: ParsedFileData }
  | { type: 'COLUMNS_MAPPED'; mappings: ColumnMapping[] }
  | { type: 'ROW_PARSED'; event: RowParseEvent<TRecord> }
  | { type: 'ROW_COMPLETE'; event: RowCompleteEvent<TRecord> }
  | { type: 'DATA_VALIDATED'; rows: RowValidation<TRecord>[] }
  | { type: 'COMMIT_STARTED'; rows: number; batches: number; excluded: number }
  | { type: 'BATCH_SETTLED'; progress: CommitProgress; created: ImportRow<TRecord>[]; rejected: RejectedRow<TRecord>[] }
  | { type: 'IMPORT_FINISHED'; report: ImportReport<TRecord> }
  | { type: 'ERROR'; error: string };

interface CommitProgress {
  done: number;    // rows with an outcome so far, saved or rejected
  total: number;   // rows being committed
  batch: number;   // batches with an outcome so far
  batches: number;
}

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

`ERROR` is emitted when a file that passed the upload checks can't be parsed, and when a choice field's options fail to load. Its `error` is written with the wizard's message catalogue.

`BATCH_SETTLED` is emitted once per batch, whether your app answered or the batch could not be sent; `created` and `rejected` are that batch's rows. `IMPORT_FINISHED` carries the report `onImportFinished` receives.

**Breaking change (before 1.0):** `onComplete` and the `IMPORT_COMPLETED` event are gone. The wizard no longer hands the records over for your app to save: pass an `adapter` and read the outcome from `onImportFinished`.

Validation errors and warnings raised by Data Weaver itself also carry a `messageRef` (their catalogue key and parameters); see [Messages and translation](#messages-and-translation).

### Individual components

Use these to build your own flow. Each step component brings its own `WizardRoot` (styling scope, tooltip context and a container for popovers), so it works on its own. To compose several pieces under one scope, wrap them in `<WizardRoot>` yourself. To show them in another language, wrap them in `<WizardRoot messages={...}>` (see [Messages and translation](#messages-and-translation)).

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
| `helpText`          | `string`                               | `upload.helpText`           | Plain text shown in the info banner. |
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
| `onComplete`     | `() => void`                             | Required | Called on "Complete Import". In `<ImportWizard />` this starts Commit. |
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
checkUpload(file, rules, italian); // the same, worded with a message catalogue

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

#### Commit

The Commit loop the wizard runs, for flows built from the individual components:

```typescript
import { commitRows, createImportKeys } from 'data-weaver';

const keys = createImportKeys(parsed.rows.length); // one per data row, when the file is parsed; keep them
const rows = validated
  .filter((row) => !row.excluded)
  .map((row) => ({ importKey: keys[row.rowIndex], rowIndex: row.rowIndex, record: row.data }));

const { created, rejected } = await commitRows(rows, {
  saveBatch: adapter.saveBatch,
  batchSize: 100,
  onBatchSettled: (batch, progress) => console.log(`${progress.done} of ${progress.total}`),
});
```

`settleBatch(rows, answer)` is the check applied to each answer. `DEFAULT_BATCH_SIZE` is 100.

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

The Rejected Rows download, for flows built from the individual components:

```typescript
import { rejectedRowsSheet, rejectedRowsFormat, sheetToBlob } from 'data-weaver';

const sheet = rejectedRowsSheet({
  file: parsed,                        // the parser's ParsedFileData
  mappings,                            // the column matching
  fields,
  rejected: report.rejected,
  unedited: firstValidated.map((row) => row.data), // records as the review opened, by rowIndex
});
const format = rejectedRowsFormat(['.csv', '.xlsx']); // 'xlsx'
const blob = sheetToBlob(sheet, { sheetName: 'Rejected rows', format });
```

Without `unedited`, every imported column is written from the reviewed records instead of the uploaded text.

`data-weaver` (not `data-weaver/core`) also exports `useHistory`, the undo/redo hook the review step uses.

---

## Messages and translation

Every piece of text the Importer sees comes from a **message catalogue**: step labels, headings, buttons, tooltips, accessible labels, placeholders, empty states, counts, upload refusals, validation messages Data Weaver raises, the options loader's failure, Find and Replace, the export menu, AI Edit, the import progress and the Import Report. Data Weaver ships English only. To show the wizard in another language, pass the entries you want to replace as `messages`. Anything you leave out stays in English. Data Weaver has no i18n library dependency: build the catalogue from your own.

```tsx
import { ImportWizard, type PartialMessageCatalogue } from 'data-weaver';

// A constant or a memoised object: not a new object on every render
const italian: PartialMessageCatalogue = {
  steps: { upload: 'Carica', mapping: 'Abbina le colonne', review: 'Controlla e correggi' },
  upload: {
    chooseFile: 'Scegli un file',
    tooLarge: '{fileName} è troppo grande. La dimensione massima è {maxSize}.',
  },
  review: {
    rowCount: ({ count }) => (count === 1 ? '1 riga' : `${count.toLocaleString('it')} righe`),
  },
  validation: {
    required: '{field} è obbligatorio',
  },
};

<ImportWizard fields={fields} adapter={adapter} messages={italian} />;
```

**Entries.** An entry is either:

- a **string** with named placeholders, e.g. `'{count} righe'`. Each `{name}` is replaced by the parameter of that name. Numbers are formatted with the browser's locale (`10,000`). A placeholder with no parameter of that name is left as it is.
- a **function** of the entry's parameters, e.g. `({ count }) => ...`. Use it for plural rules, or to call your i18n library:

  ```tsx
  const { t } = useTranslation('import');
  const messages = useMemo<PartialMessageCatalogue>(
    () => ({ review: { rowCount: ({ count }) => t('rowCount', { count }) } }),
    [t]
  );
  ```

**Types.** `PartialMessageCatalogue` is what `messages` accepts. TypeScript rejects unknown groups or keys and functions with the wrong parameters, so your translations are checked. `MessageCatalogue` is the complete catalogue. `DEFAULT_MESSAGES` holds the English defaults. `MessageParams` gives each entry's parameters.

**Step components used on their own** read the catalogue from the nearest `WizardRoot`: wrap them in `<WizardRoot messages={italian}>`. A `WizardRoot` inside another only replaces the entries it is given. Components outside any `WizardRoot` are in English.

**Validation messages.** Messages from your own validators (`FieldConfig.validate`, `validateRow`) are yours, and are shown as you wrote them. Messages Data Weaver raises itself (required, invalid date, not one of the options…) are shown from the `validation.*` entries. On a `ValidationError` or `ValidationWarning` in the rows and events you receive, `message` is the English text and `messageRef` holds the entry's key and parameters. To show one in your language, use `formatValidationMessage(error, italian)`.

**Upload refusals and `ERROR` events.** `checkUpload(file, rules, messages)` returns its refusal in the catalogue's language. The `ERROR` event's `error` is written with the wizard's catalogue.

**Field labels and options** are part of your Output Shape, not of the catalogue: give them in the Importer's language in `fields`.

**Rejection reasons** from your `saveBatch` are your own text and are shown as you give them. Only the reasons Data Weaver gives itself (a batch that could not be sent, an answer with no valid outcome, a rejection without a reason) come from the catalogue.

### Keys

Keys are grouped by where the text appears. They are part of the public API: renaming or removing one is a breaking change.

| Key | Parameters | English default |
| --- | ---------- | --------------- |
| `steps.upload` | - | `Upload` |
| `steps.mapping` | - | `Match columns` |
| `steps.review` | - | `Review and edit` |
| `steps.import` | - | `Import` |
| `upload.helpText` | - | `Upload a spreadsheet with column names in the first row and one record per row after it.` |
| `upload.dropHere` | - | `Drop your file here` |
| `upload.dragAndDrop` | - | `Drag and drop a file here` |
| `upload.accepted` | types, maxSize, maxBytes | `You can upload: {types} (up to {maxSize})` |
| `upload.chooseFile` | - | `Choose a file` |
| `upload.unsupportedType` | fileName, types | `{fileName} is not a supported file type. You can upload: {types}` |
| `upload.tooLarge` | fileName, maxSize, maxBytes | `{fileName} is too large. The maximum file size is {maxSize}.` |
| `upload.empty` | fileName | `The file appears to be empty or has no data rows.` |
| `upload.unreadable` | fileName, reason | `{fileName} could not be read: {reason}` |
| `mapping.title` | - | `Map Columns` |
| `mapping.description` | - | `Match your file columns to the expected fields` |
| `mapping.mappedCount` | mapped, total | `{mapped}/{total} mapped` |
| `mapping.autoMatched` | - | `Some columns were auto-matched. Review and adjust as needed.` |
| `mapping.autoBadge` | - | `Auto` |
| `mapping.selectField` | - | `Select field...` |
| `mapping.doNotImport` | - | `Don't import` |
| `mapping.missingRequired` | fields, count | `Missing required fields: {fields}` |
| `mapping.continue` | - | `Continue to Validation` |
| `options.loading` | fields, count | `Loading the options for {fields}…` |
| `options.loadFailed` | field, reason | `Could not load the options for {field}: {reason}` |
| `options.blocked` | - | `The rows can't be reviewed or imported until the options load.` |
| `options.retry` | - | `Try again` |
| `review.title` | - | `Validate Data` |
| `review.description` | - | `Review, search, and fix data before importing` |
| `review.rowCount` | count | `1 row`, `10,000 rows` |
| `review.rowCountFiltered` | visible, total | `12 of 10,000 rows` |
| `review.filterValid` | count | `{count} Valid` |
| `review.filterWarnings` | count | `{count} Warnings` |
| `review.filterErrors` | count | `{count} Errors` |
| `review.filterExcluded` | count | `{count} Excluded` |
| `review.noSearchMatches` | - | `No rows match your search` |
| `review.noFilterMatches` | - | `No rows match the current filter` |
| `review.rowNumberHeader` | - | `#` |
| `review.statusHeader` | - | `Status` |
| `review.excludeRow` | row | `Exclude row {row}` |
| `review.includeRow` | row | `Include row {row}` |
| `review.excludeRowHint` | - | `Leave this row out of the import` |
| `review.includeRowHint` | - | `Include this row in the import again` |
| `review.excludedStatus` | - | `Excluded` |
| `review.cellLabel` | field, row | `{field}, row {row}` |
| `review.excludeErrors` | - | `Exclude Errors` |
| `review.excludeErrorsHint` | - | `Leave every row that still has errors out of the import` |
| `review.fillRequired` | - | `Fill Required` |
| `review.fillRequiredHint` | - | `Fill empty required fields with placeholder values` |
| `review.fillPlaceholder` | - | `N/A` |
| `review.undo` | - | `Undo (Ctrl+Z)` |
| `review.redo` | - | `Redo (Ctrl+Shift+Z)` |
| `review.back` | - | `Back to Mapping` |
| `review.excludedCount` | count | `{count} excluded` |
| `review.complete` | count | `Complete Import (1 row)`, `Complete Import (2 rows)` |
| `commit.title` | - | `Importing your rows` |
| `commit.progress` | done, total | `0 of 1 row processed`, `100 of 250 rows processed` |
| `commit.progressLabel` | - | `Import progress` |
| `commit.keepOpen` | - | `Keep this page open until the import finishes.` |
| `commit.notSent` | - | `This row could not be sent. Try importing it again later.` |
| `commit.invalidAnswer` | - | `No clear answer was received for this row, so it was not counted as imported.` |
| `commit.noReason` | - | `Refused without a reason.` |
| `report.title` | - | `Import finished` |
| `report.created` | count | `{count} imported` |
| `report.rejected` | count | `{count} rejected` |
| `report.excluded` | count | `{count} excluded` |
| `report.rejectedTitle` | - | `Rejected rows` |
| `report.rejectedDescription` | - | `These rows were not imported.` |
| `report.excludedTitle` | - | `Excluded rows` |
| `report.excludedDescription` | - | `You left these rows out of the import, so they were not sent.` |
| `report.rowHeader` | - | `Row` |
| `report.fieldHeader` | - | `Field` |
| `report.reasonHeader` | - | `Reason` |
| `report.download` | - | `Download rejected rows` |
| `report.downloadHint` | - | `This report is not kept once you leave. Download the rejected rows to fix them in your spreadsheet and import them again.` |
| `report.downloadFileName` | fileName | `{fileName} - rejected rows` |
| `report.downloadSheetName` | - | `Rejected rows` |
| `report.downloadErrorHeader` | - | `Error` |
| `report.downloadError` | reason | `{reason}` |
| `report.downloadFieldError` | reason, field | `{field}: {reason}` |
| `cell.empty` | - | `empty` |
| `cell.clear` | - | `Clear` |
| `cell.save` | - | `Save` |
| `cell.cancel` | - | `Cancel` |
| `search.placeholder` | - | `Search in data...` |
| `search.clear` | - | `Clear search` |
| `search.matchCount` | count | `1 match`, `2 matches` |
| `findReplace.open` | - | `Find & Replace` |
| `findReplace.title` | - | `Find and Replace` |
| `findReplace.description` | - | `Search and replace text across all data cells. Use Ctrl+Enter to replace.` |
| `findReplace.find` | - | `Find` |
| `findReplace.findPlaceholder` | - | `Text to find...` |
| `findReplace.replace` | - | `Replace with` |
| `findReplace.replacePlaceholder` | - | `Replacement text (leave empty to delete)` |
| `findReplace.column` | - | `In column` |
| `findReplace.allColumns` | - | `All columns` |
| `findReplace.caseSensitive` | - | `Case sensitive` |
| `findReplace.wholeWord` | - | `Whole word` |
| `findReplace.willUpdate` | count | `1 cell will be updated`, `2 cells will be updated` |
| `findReplace.noMatches` | - | `No matches found` |
| `findReplace.replaced` | count | `Replaced 1 cell`, `Replaced 2 cells` |
| `findReplace.close` | - | `Close` |
| `findReplace.replaceAll` | - | `Replace All` |
| `export.menu` | - | `Export` |
| `export.csv` | - | `Export as CSV` |
| `export.excel` | - | `Export as Excel` |
| `export.validOnly` | - | `Export valid rows only (Excel)` |
| `export.fileName` | - | `data-export` |
| `export.validFileName` | - | `data-export-valid` |
| `export.sheetName` | - | `Data` |
| `aiEdit.open` | - | `AI Edit` |
| `aiEdit.placeholder` | - | `Describe how to edit the data...` |
| `aiEdit.send` | - | `Send` |
| `aiEdit.examplesLabel` | - | `Try:` |
| `aiEdit.examples` | - | `Capitalize all titles`, `Trim whitespace from all fields`, `Fix common spelling mistakes`, `Standardize currency to USD` (one per line) |
| `aiEdit.working` | - | `Analyzing data and generating edits...` |
| `aiEdit.failed` | - | `An unexpected error occurred` |
| `aiEdit.noChanges` | command | `No changes needed for "{command}"` |
| `aiEdit.command` | command | `"{command}"` |
| `aiEdit.willEdit` | count | `1 row will be edited`, `2 rows will be edited` |
| `aiEdit.previewRow` | row, changes | `Row {row}: {changes}` |
| `aiEdit.previewChange` | field, value | `{field}="{value}"` |
| `aiEdit.more` | count | `...and {count} more` |
| `aiEdit.cancel` | - | `Cancel` |
| `aiEdit.apply` | - | `Apply Changes` |
| `aiEdit.dismiss` | - | `Dismiss` |
| `validation.required` | field | `{field} is required` |
| `validation.invalidDate` | field, format, dateOrder | `{field} is not a valid date (use {format} or YYYY-MM-DD)` |
| `validation.notAnOption` | field, options | `{field} must be one of: {options}` |
| `validation.notAnOptionAndMore` | field, options, more | `{field} must be one of: {options} and {more} more` |
| `validation.optionsNotLoaded` | field | `The options for {field} are not loaded` |
| `validation.noOptions` | field | `{field} has no options to choose from` |
| `validation.amountWithoutCurrency` | field | `Value amount provided without currency` |
| `validation.currencyWithoutAmount` | field | `Currency provided without value amount` |
| `validation.numericOnly` | field | `{field} appears to be numeric only` |

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

The demo app (`src/pages/Index.tsx`) is an artwork importer that saves into a simulated, in-memory Host App (`src/pages/demoHostApp.ts`): it honours Import Keys and rejects an artwork whose title and artist are already in the collection, so importing the same file twice shows Rejected Rows. It is deployed to GitHub Pages by `.github/workflows/deploy.yml`.

## Planned

From the [purpose and scope](docs/product/2026-09-23-purpose-and-scope.md): resolving Relationship Fields to existing records before Commit, automatic retries of batches lost in transit, and Fix & Retry.

## License

No license has been chosen yet.
