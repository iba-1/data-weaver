# 22: Read numbers written with thousand separators and a decimal comma

**What to build:** A `number` field reads amounts the way Italian and other European Importers write them. Today `parseNumber` strips every comma and reads the rest with `parseFloat`, so `1.500,00` becomes **1.5** and `1.500` becomes **1.5**: a silent 1000× error on the value of an artwork, with no cell error. Verified on 2026-09-29 against `src/lib/import-wizard/values.ts`: `1.500,00` → 1.5, `1.500` → 1.5, `1,500.00` → 1500, `1500.00` → 1500.

**Blocked by:** None (can start immediately)

**Status:** done (2026-09-30)

Requested by: `speakart-frontend/.scratch/data-weaver-import/issues/02-collection-import.md` (client answer #10: amounts come with or without thousand separators)

**Rule (decided 2026-09-29, per column):**
1. A value with both `.` and `,`: the last one is the decimal separator, the other the thousands separator (`1.500,00` → 1500, `1,500.00` → 1500).
2. A separator that repeats is the thousands separator (`1.500.000`, `1,500,000` → 1500000).
3. A single separator not followed by exactly 3 digits is the decimal separator (`1,5` → 1.5, `1500.00` → 1500, `12.5` → 12.5).
4. A single separator followed by exactly 3 digits (`1.500`, `1,250`) is decided by the **column**: if another value in the same column shows which separator is the decimal (by rules 1 or 3), use it (`1.250` with `1.25` elsewhere → 1.25; with `1.500,00` or `1,5` elsewhere → 1250). With no evidence in the column, read it as thousands (→ 1250) and put a non-blocking **warning** on the cell ("read as 1,250: check it").
5. Excluded Rows and empty cells don't count as evidence. The column is re-evaluated after edits, so fixing one cell can settle the others.

- [x] The rule above implemented and recorded in the README's type-conversion table
- [x] A value the rule can't read at all (e.g. `1.50.0`) is a cell error that keeps the text, never a silently wrong number (as for dates)
- [x] Excel number cells keep their numeric value whatever their display format
- [x] Unit tests: `1.500,00`, `1500,5`, `1.500`, `1,500.00`, `1500.00`, `1500`, `€ 1.500`, `-1.500,00`, `1.500.000`; rule 4 with dot-decimal evidence, comma-decimal evidence and no evidence (warning); evidence changing after an edit
- [x] The Find & Replace and AI Edit paths use the same rule

## Notes from the implementation

- `values.ts`: `readNumber(text, decimal)` (rules 1–4, `ambiguous`, `unreadable`), `columnDecimal(texts)`; `parseNumber` keeps its API with the new rules (no column).
- `numberColumns.ts`: `settleNumberColumns(rows, fields, revalidate)` reads every number column again from `RowValidation.numberTexts` (the file's text, or the Importer's edit) and sets the `validation.ambiguousNumber` warning; run by `validateRows` and after every edit and exclusion in `useReviewRows` (Find & Replace and AI Edit go through the same edits). Undo/redo restore settled rows.
- Excel number cells bypass the text rules. Text that isn't a number keeps its text and gets `validation.invalidNumber` (it used to be read leniently, `12abc` → 12, or silently emptied, `N/A` → null).
- New catalogue keys: `validation.invalidNumber`, `validation.ambiguousNumber`. README: a "Numbers" section.

