# Full Code Review — React Import Wizard

- **Date:** 2026-09-23
- **Scope:** everything built on top of the Lovable template, `b331aa1..HEAD` (`0d7fc75`) plus uncommitted working-tree changes (favicon). 37 files, ~6.5k lines. Excludes `package-lock.json`, `bun.lockb`, and template shadcn code in `src/components/ui/`.
- **Diff:** `git diff b331aa1 -- . ':!package-lock.json' ':!bun.lockb' ':!src/components/ui'`
- **Method:** two parallel reviewers, one per axis. **Standards** checks the code against the documented rules. **Spec** checks the behaviour against the documents. Key claims were spot-checked by hand.
- **Spec sources:** there is no issue tracker (`docs/agents/issue-tracker.md` is missing). The spec is `README.md`, `src/components/import-wizard/README.md`, `CLAUDE.md` and the commit messages.
- **Standards sources:** `CLAUDE.md` (project), `eslint.config.js`, the global engineering rules, and a baseline of Fowler code smells.

## Check results

| Check | Result |
|---|---|
| `npm test` | ✅ 52/52 pass (5 files) |
| `npx tsc --noEmit -p tsconfig.app.json` | ✅ clean |
| `npm run build` | ✅ passes. Correct `/data-weaver/` asset and favicon paths. Main chunk is 1.03 MB (over the 500 kB warning limit). |
| `npm run lint` | ❌ 3 errors: 2 in template `src/components/ui`, 1 `require()` at `tailwind.config.ts:98`. 9 warnings, including `FindReplaceDialog.tsx:61` and `ImportWizard.tsx:52`. |

---

## Standards

### Hard violations (documented rules)

1. **The edge function has no auth and no rate limiting.** `supabase/config.toml` sets `verify_jwt = false` for `ai-edit-rows`. There is no caller check and no throttling, yet every call spends paid AI credits. Anyone who finds the URL can drain the AI key.
   - Breaks: *rate limiting on auth and write operations*; *never trust client data*.
2. **CORS is a wildcard.** `supabase/functions/ai-edit-rows/index.ts:4` sets `"Access-Control-Allow-Origin": "*"`.
   - Breaks: *set CORS to specific origins, never `*`*.
3. **No server-side input validation** (`index.ts:31-38`). The body is only type-cast; `command`, `rows` and `fields` are checked for presence only.
   - `fields[].key/label/type` and `command` are interpolated straight into the system and user prompts (`:53`, `:86`), which leaves the prompt open to injection.
   - The body size is unbounded; only the prompt is truncated to 100 rows (`:83`).
   - The model's `edits` are returned without validation (`:185`). The client writes any returned key into the row (`DataValidator.tsx:271-279`, `updatedData[key] = value`), including keys that aren't configured fields.
   - Breaks: *validate all input server-side*.
4. **Errors and data leak.** The raw `error.message` is returned to the client (`index.ts:191`). The model's `error` text is passed through (`:176-178`). The user's command and the full AI response, which contain user row data, are logged (`:93`, `:147`).
5. **`.env` is committed to git** and isn't in `.gitignore`. It contains `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID` and `VITE_SUPABASE_PUBLISHABLE_KEY`, an anon-role JWT that is public by design. Nothing privileged has leaked. There is a single project, and the deploy build depends on the committed file.
   - Breaks: *never commit secrets*; *separate credentials per environment*.
6. **Unhappy paths are untested.** `parser.test.ts` covers only the file-type helpers; `parseFile` is never tested with malformed input. `useHistory`, `DataValidator`, `AiEditChat` (network failures) and the edge function have no tests.
   - Breaks: *test unhappy paths*.
7. **Observability is missing.** There is no crash reporting, no persistent logging (only `console.*`, e.g. `AiEditChat.tsx:71`) and no `/health` endpoint.
8. **The deploy pipeline has no quality gate.** `.github/workflows/deploy.yml` runs `npm ci && npm run build` and deploys on push to `main`, with no lint or test step. A lint step would currently fail.

### Judgement calls (code smells)

- **Duplicated code: number coercion.** `replace(/[,$€£¥\s]/g, '')` + `parseFloat` appears at `DataValidator.tsx:213`, `:246`, `:274` and `validator.ts:280`. `processValue` isn't exported, so the component re-implemented it. Export a single `coerceValue` from `src/lib/import-wizard/`.
- **Duplicated code: regex escaping.** The escape pattern appears three times (`DataValidator.tsx:150`, `:199`, `:205`). Find/replace matching belongs in the pure-TS layer.
- **Duplicated code: exporter.** The row-to-array mapping is repeated at `exporter.ts:40-45` and `:94-99`.
- **Divergent change / large component.** `DataValidator.tsx` is 675 lines. It handles undo/redo shortcuts, search, find/replace, AI edits, export, fill-required, pagination, table rendering and `ValidationRow`.
- **Dead code.** `DataValidator.tsx:351-353` is an empty `useEffect` ("handled by the useHistory hook").
- **Contradictory config.** `index.ts:95` defaults the gateway to `https://api.openai.com/v1/chat/completions`, but `:104` hard-codes `model: "google/gemini-3-flash-preview"`, a Lovable gateway model id. Not verified against the API.
- **Data clumps.** `{ rowIndex, changes }` is declared three times: `EditedRow` (edge function), `PendingEdit` (`AiEditChat.tsx:22`) and inline in `DataValidator.tsx:262`. `{ fields, requiredFields }` travels together into every `revalidateRow` call.
- **Leaky generic defaults.** The generic `ImportWizard.tsx:51-52` falls back to `ARTWORK_FIELD_CONFIGS` and `['title','artist']`.
- **No service layer.** `AiEditChat.tsx:73` calls `supabase.functions.invoke` directly from the UI and reads the response untyped (`data?.edits as PendingEdit[]`, `:90`).
- **Date parsing.** `new Date(stringValue)` (`validator.ts:291`) parses non-ISO input such as `01/15/2024` as local time. It conflicts slightly with the store-in-UTC rule.
- **Silent truncation.** The edge function edits only the first 100 rows, and the UI doesn't say so.

### Compliant

- `src/lib/import-wizard/` has no React, lucide or `@/components` imports, so the two-layer rule holds.
- The `@/` alias is used consistently.
- Tests live in `__tests__` as documented.
- `styles.css` uses theme tokens; the only exception is the shadow `rgb(0 0 0 / 0.1)` at line 175.

---

## Spec

### (c) Implemented but wrong (most severe first; confirmed with throwaway vitest probes)

1. **The README's "Real-Time Progress Tracking" example loops forever.**
   - Spec: `onRowComplete` is "Called when a row passes validation or is edited".
   - Observed: with 2 rows, `onRowComplete` fired more than 5000 times.
   - Cause: `DataValidator.tsx:108-110` calls `onRowsChange` from an effect. `ImportWizard.tsx:170-190` then emits ROW_COMPLETE for **every** row (its comment wrongly says "changed rows"). The consumer's `setState` creates new inline callbacks, which re-trigger the effect. Even without the loop, every row fires twice on entering step 3.
2. **The `requiredFields` default is wrong.**
   - README: defaults to "`[]`".
   - Code: defaults to `['title','artist']` (`ImportWizard.tsx:52`, `validator.ts:59,153`).
   - Impact: any non-artwork `fields` without `requiredFields` makes every row invalid ("Title is required"), so `onComplete` receives `[]`.
3. **`FieldConfig.required` is not enforced by the validator.**
   - README: "Whether this field is required for a valid row".
   - Only `ColumnMapper.tsx:30,103` reads it, to gate mapping; the validator reads only `requiredFields`. That leaves two sources of truth.
4. **A custom `validateRow` is lost after any edit.** `DataValidator` has no `validateRow` prop, and `revalidateRow` is called without `customValidator` (`DataValidator.tsx:225,253,282,326`). Editing a row into a value the custom validator rejects gives `isValid: true`, so the row gets imported.
5. **Ctrl+Shift+Z redo never fires.**
   - README: "Ctrl+Shift+Z / Ctrl+Y — Redo".
   - `DataValidator.tsx:89` checks `e.key === 'z'`, but browsers report `'Z'` when Shift is held.
   - The listener is on `window`, so it also hijacks native undo inside the cell, search and AI inputs.
6. **The AI edit cannot work with the default gateway.** The model/URL mismatch above means the likely result is a generic "AI service error" (unverified).
   - The function's specific 400/429/402 messages never reach the UI: on a non-2xx status `supabase.functions.invoke` returns `data = null`, and `AiEditChat.tsx:81-88` shows the generic invoke error.
   - Only the first 100 rows are sent (`index.ts:82`), and the user isn't told.

### (a) Missing or partial

- **The "Prepare npm-ready export" claim is not met.**
  - `package.json` is still `"name": "vite_react_shadcn_ts"`, `"private": true`, `version 0.0.0`, with no `main`/`exports`/`types`/`peerDependencies`/`files`. There is no library build mode in `vite.config.ts`.
  - The README's `npm install react-import-wizard` and `import 'react-import-wizard/styles.css'` cannot work.
  - Importing the library crashes at load ("supabaseUrl is required") unless `VITE_SUPABASE_*` is set, via `AiEditChat` → `integrations/supabase/client.ts`.
  - It also throws "`Tooltip` must be used within `TooltipProvider`" unless the consumer adds the provider. Neither requirement is documented.
- **Documented `ImportWizard` props are ignored.** `title`, `description`, `acceptedFileTypes` and `maxFileSize` are destructured (`ImportWizard.tsx:42-45`) but never used. There is no file-size validation, even though the README promises "File size and type validation".
- **TSV is not supported.**
  - The README says "CSV, TSV, XLS, XLSX support", and the UI copy says ".csv, .tsv, .txt" (`FileUploader.tsx:168`).
  - But `parser.ts:16` throws on `.tsv`/`.txt`, and the input's `accept` is `.csv,.xlsx,.xls,.pdf` (`FileUploader.tsx:125`).
- **"Automatic encoding detection" is not implemented.** `parser.ts:20` uses `file.text()`, which is UTF-8 only.
- **"Visual confidence indicators" are partial.** `confidence` is never rendered; there is only a binary Sparkles badge (`ColumnMapper.tsx:148`).
- **Lovable removal is incomplete in git.** Commit `0d7fc75` didn't touch `public/favicon.ico`, so `HEAD` still ships the Lovable favicon. The fix (new `.ico` + `public/favicon.svg`) is uncommitted.

### (b) Scope creep (not in spec)

- A PDF path that is accepted, then rejected (`parser.ts:61-70`, `ImportWizard.tsx:68-74`). Upload errors mention "CSV, Excel, or PDF".
- `AiEditChat` is exported in the public API but not documented in either README. The README calls the keyword matcher "AI-powered fuzzy matching", which it isn't.
- The default `helpText` is placeholder copy claiming it "supports HTML" (`FileUploader.tsx:21`); it is rendered as plain text.

### GitHub Pages

- The `/data-weaver/` base and `BrowserRouter basename={BASE_URL}` produce correct paths in the build.
- There is no `404.html` SPA fallback, so deep links get GitHub's 404. Low impact while only `/` is routed.
- The workflow has not been run on GitHub Actions as part of this review. It builds using the committed `.env`.

### Other

- Commit `0d7fc75` is authored as `dario.decianni@trame-digitali.it` instead of `deciannidario@gmail.com`.

---

## Summary

- **Standards:** 8 hard violations and 11 judgement calls. Worst: the AI edge function is unauthenticated, CORS-wildcarded and not rate-limited.
- **Spec:** 6 wrong behaviours, 6 missing or partial features and 3 scope-creep items. Worst: the `onRowComplete` infinite loop, followed by the custom `validateRow` being dropped after edits.

## Re-prioritised after Purpose & Scope (2026-09-23)

The purpose was agreed after this review (see [`docs/product/2026-09-23-purpose-and-scope.md`](../product/2026-09-23-purpose-and-scope.md)), and it changes what matters. This section **supersedes** the "Suggested order of fixes" below.

### P0 status (2026-09-23)

All P0 code items are addressed on the working branch (uncommitted at time of writing):
- **AI Edit:** it is now an optional `aiEdit` handler supplied by the Host App. The Supabase client, the `ai-edit-rows` function and `.env` are removed from the repo, and the demo has no AI Edit. **The function already deployed to Supabase is still live until someone deletes it there.**
- **Validation fixes:** the `onRowComplete` loop, the `requiredFields` default, `FieldConfig.required` and the custom `validateRow` after edits are fixed, each with a regression test.
- **Row exclusion:** added, with Excluded Rows reported in `onComplete(data, { excludedRows })`.
- **Self-contained:** `WizardRoot` supplies the tooltip context, a portal container and the `.dw-root` style scope.
- **Package build:** `npm run build:lib` builds the package (ESM + CJS, type declarations, scoped `styles.css`). `npm pack` output was verified in a fresh Tailwind-free host app, in a browser.

**Correction to the "`onComplete` silently drops invalid rows" finding:** in the wizard, "Complete Import" was disabled while any row had errors, so rows were not actually dropped. The real gap was that the Importer had no way to leave a row out; their only options were fixing it or "Fill Required" with placeholder data. The filter in `handleComplete` only mattered if `DataValidator` was driven directly.

### P0: live risk, or conflicts with the agreed purpose
| Finding | Why P0 now |
|---|---|
| `ai-edit-rows` is live, unauthenticated, open to any origin (CORS `*`) and not rate-limited | It is deployed and spends paid credits today. Take it down or lock it, and disable AI Edit on the public demo (Q25, Q26). |
| `onComplete` silently drops invalid rows | Directly contradicts the Excluded Row rule (Q8): rows are never dropped silently. |
| `onRowComplete` infinite loop | A correctness bug in the documented API. |
| `requiredFields` defaults to artwork's `['title','artist']`; `FieldConfig.required` ignored | Contradicts the general-purpose goal (Q3). The Output Shape must be the single source of truth for required fields. |
| Custom `validateRow` lost after edits | Invalid rows would be committed. |
| The library crashes without `VITE_SUPABASE_*` and throws without `TooltipProvider` | Blocks embedding in any Host App. AI Edit must be optional (Q4), and the library must be self-contained (Q30). |
| Not publishable (`private`, template name, no library build or exports) | Blocks the SpeakArt integration (Q1). Needs a library build plus compiled, scoped CSS (Q30). |

### P1: required for the first SpeakArt integration (collection asset import)
- **New capabilities from the scope doc** (not review findings, listed for sequencing):
  - Resolution
  - Commit with Import Keys and per-row outcomes
  - Import Report
  - Fix & Retry
  - explicit row exclusion
  - message catalogue (i18n)
  - live enum option lists
  - a virtualised grid for 10k rows
- **Split `DataValidator.tsx` (675 lines)** before adding Resolution and Fix & Retry to it. Move number coercion and find/replace matching into `src/lib/import-wizard/`.
- **Redo (Ctrl+Shift+Z) broken; the global keydown listener hijacks native undo in inputs.**
- **Ignored props** (`title`, `description`, `acceptedFileTypes`, `maxFileSize`): wire them up or remove them.
- **Docs that promise features which don't exist:** TSV/TXT support, encoding detection, confidence indicators, "AI-powered" matching, `helpText` "supports HTML". Implement each or remove the claim. Also remove the PDF path.
- **Share one row-edit type** (`{rowIndex, changes}` is declared 3 times). It becomes part of the Commit contract.
- **Unhappy-path tests** alongside each fix: malformed files, Commit network failure, lost batches, rejections.
- **CI:** add lint and test gates to `deploy.yml`, and fix the 3 lint errors.
- **Stop tracking `.env`.** It holds only the public anon key, but the rule applies. Give the deploy its variables from CI secrets.
- **Date parsing:** `new Date(str)` reads non-ISO dates in local time. Parse explicitly and store dates in UTC.

### P2 / deferred
- **AI Edit hardening, required before any Host App enables it:**
  - auth and rate limiting
  - a CORS allow-list
  - input schema validation, and output validation against the Output Shape
  - scrubbed errors and logs
  - fix the model/gateway mismatch
  - surface the function's own error messages in the UI
  - handle the 100-row truncation
  - move the call behind a service layer
  - `/health`
- **Observability:** the library should expose an error callback to the Host App. Crash reporting and persistent logging belong to the Host App and the demo site.
- **Cleanup:** exporter duplication, the dead `useEffect`, the `{fields, requiredFields}` data clump.
- **`404.html` SPA fallback on GitHub Pages.**
- **Git author email** on `0d7fc75`.

### No longer relevant
- The generic wizard's artwork defaults: the artwork example becomes one Output Shape of the demo (Q26), which removes this concern.

### Dependencies in SpeakArt
The backend changes listed in the scope doc: per-row outcomes, Import Key, removing the `break`, normalised Related Record lookup, and the shipper/author bug.

## Suggested order of fixes (original, superseded)

1. Lock down `ai-edit-rows`: JWT verification, rate limit, CORS allow-list, input schema validation, output validation against configured fields, and scrubbed errors and logs.
2. Fix the behaviour bugs, each with a reproducing test first:
   - the `onRowComplete` loop
   - the `requiredFields` default / `FieldConfig.required`
   - custom `validateRow` after edits
   - the Ctrl+Shift+Z redo key
3. Fix the AI gateway/model mismatch, and surface the function's error messages in `AiEditChat`.
4. Add lint and test steps to `deploy.yml`, fix the lint errors, and stop tracking `.env`.
5. Either make the package actually publishable or drop the npm claims from the README. Wire up or remove the ignored props, the TSV claim and the PDF path.
6. Refactor: split `DataValidator`, move coercion and find/replace logic into `src/lib/import-wizard/`, share one `RowEdit` type, and add an AI service layer.
