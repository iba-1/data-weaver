Status: ready-for-agent

# Spec: Host App commit pipeline (first SpeakArt integration: collection asset import)

Vocabulary follows `CONTEXT.md`. Decisions trace back to `docs/product/2026-09-23-purpose-and-scope.md` (Q-numbers), [ADR-0001](../../docs/adr/0001-resolve-related-records-before-commit.md) and [ADR-0002](../../docs/adr/0002-host-apps-must-honour-import-keys.md).

## Problem Statement

Importers, the collection staff migrating legacy spreadsheets, can clean up a file in Data Weaver today: upload it, map its columns, fix and exclude rows. But Data Weaver stops there. It hands records to the Host App and leaves everything that goes wrong afterwards to them:

- **Duplicate and crashing Related Records.** A spreadsheet row names people (an author, an owner, a lender), not records. SpeakArt today matches those names by exact text, in parallel. So `lucio fontana` and `Lucio Fontana` become two Registry entries, the same name used as lender and owner can be created twice, and names that already exist twice crash the import.
- **Failures with no reason.** When the Host App refuses some rows, the Importer is not told which ones or why. Some failures silently abandon every remaining row in the request.
- **No safe retry.** When the network drops after the server saved a batch, nobody knows what was saved. Retrying risks creating the same artworks twice.
- **English only.** The interface is in English, while SpeakArt ships five languages.
- **Hard-coded choices.** Option lists such as currencies are hard-coded, so they drift from what the Host App actually accepts.
- **Too slow for real collections.** The review grid shows 10 rows per page and is not built for files of thousands of rows.

## Solution

Data Weaver takes the import all the way to the Host App's database:

- **The flow:** upload → map → review → **Resolution** → **Commit** → **Import Report** → **Fix & Retry**.
- **What the Host App provides:**
  - an Output Shape, including Relationship Fields and live option lists;
  - a message catalogue in the Importer's language;
  - a small adapter to look up Related Records, create Related Records, and save batches of rows.
- **Resolution:** every distinct Relationship Field value in the file is matched once. The Importer sees exactly which Related Records will be reused, picked or created, and Homonyms and Possible Matches are settled by a person, not guessed.
- **Commit:** it creates the new Related Records first, once each, then saves rows in batches that carry Related Record IDs and an Import Key per row. Retries are therefore always safe.
- **Import Report:** it says how many rows were imported, lists every Rejected Row with its reason, and separately lists the Excluded Rows.
- **Fix & Retry:** the Importer corrects only the Rejected Rows and commits them again.

## User Stories

### Importer: reviewing data

1. As an Importer, I want to scroll, search and edit a file of 10,000 rows without the page slowing down, so that I can migrate a whole collection in one go.
2. As an Importer, I want undo and redo to keep working on large files, so that I can experiment with bulk fixes safely.
3. As an Importer, I want Ctrl/Cmd+Shift+Z and Ctrl+Y to redo, so that the documented shortcuts work.
4. As an Importer, I want undo inside a text field to undo my typing, not the whole grid, so that editing a cell feels normal.
5. As an Importer, I want fields with a fixed set of values (e.g. currency) to offer a list of the values the system accepts, so that I don't have to guess the spelling.
6. As an Importer, I want a value like `eur` or `Euro` to be recognised as the accepted option `EUR` when it clearly matches, so that I don't fix hundreds of cells by hand.
7. As an Importer, I want values that match no accepted option flagged as errors on the exact cell, so that I know what to fix.
8. As an Importer, I want dates read the same way regardless of my computer's time zone, so that an artwork's date doesn't shift by a day.
9. As an Importer, I want every label, button, message and error shown in my language, so that I can work without knowing English.

### Importer: Resolution

10. As an Importer, I want a Resolution step after review that lists every related person or organisation named in my file, so that I can check them before anything is saved.
11. As an Importer, I want each distinct name listed once, with how many rows use it, even when it appears in several columns (e.g. lender and owner), so that I review 40 names instead of 800 cells.
12. As an Importer, I want names that differ only in case, extra spaces or accents (`Niccolò` / `niccolo `) treated as the same automatically, so that keyboard differences don't create duplicates.
13. As an Importer, I want to see which spellings were folded together under each name, so that I can trust the automatic matching.
14. As an Importer, I want names that already exist in the system shown as "matched existing", so that I know they'll be reused rather than created.
15. As an Importer, I want to be told when a name matches several existing records (Homonyms), with enough detail to tell them apart (e.g. birth year), so that I can pick the right one.
16. As an Importer, I want to be unable to commit until every Homonym is decided, so that no artwork is attached to the wrong person by accident.
17. As an Importer, I want to assign individual rows of a Homonym to a different record than the rest, so that two artists sharing a name can both be imported correctly.
18. As an Importer, I want to choose "create new" for a Homonym, so that a genuinely new person with an existing name can be added.
19. As an Importer, I want names that will be created shown with the spelling that will be stored, so that I can catch typos before they become records.
20. As an Importer, I want that spelling to default to the most frequent one in my file, preferring the accented form, and to be editable, so that the stored name is right with no extra clicks.
21. As an Importer, I want possible duplicates (`Fontana, Lucio`, `L. Fontana` vs `Lucio Fontana`) suggested but kept separate unless I choose to merge them, so that different people are never merged behind my back.
22. As an Importer, I want all four groups (matched, several matches, will be created, possibly the same) shown in full, so that I can audit everything that will happen.
23. As an Importer, I want the grid to keep showing what my file said, with a badge naming the record it resolved to, so that I can trace every link back to my spreadsheet.
24. As an Importer, I want to go back from Resolution to review and fix a name at the source, so that a typo can be corrected where it was made.
25. As an Importer, I want nothing to be created in the system while I'm still reviewing or resolving, so that abandoning the import leaves no trace.

### Importer: Commit, Import Report, Fix & Retry

26. As an Importer, I want to see progress while rows are being saved, so that I know the import is working on a large file.
27. As an Importer, I want brief network problems retried automatically, so that I don't have to babysit the import.
28. As an Importer, I want a retry never to create an artwork twice, so that I can retry without fear.
29. As an Importer, I want every row that can be saved to be saved even if some fail, so that 3 bad rows don't block 800 good ones.
30. As an Importer, I want an Import Report saying "785 imported · 12 rejected · 3 excluded", so that I know the outcome at a glance.
31. As an Importer, I want each Rejected Row listed with its row number, the reason in plain words and the field at fault, so that I know exactly what to fix.
32. As an Importer, I want the rows I excluded listed separately from the rejected ones, so that my own choices aren't confused with system errors.
33. As an Importer, I want rows that could not be sent at all (e.g. the server was unreachable after retries) reported as rejected with that reason, so that they can be retried later.
34. As an Importer, I want rows that depended on a Related Record that failed to be created reported as rejected with that reason, so that the cause is clear.
35. As an Importer, I want a Fix & Retry view showing only the Rejected Rows with the errors pinned to the offending cells, so that I fix just what's broken.
36. As an Importer, I want already imported rows locked and out of the way in Fix & Retry, so that I can't accidentally change or re-send them.
37. As an Importer, I want to exclude a Rejected Row in Fix & Retry, so that I can give up on a hopeless row and finish.
38. As an Importer, I want Fix & Retry to go through Resolution again only for new or changed names, so that fixing a typo in an author gets resolved properly.
39. As an Importer, I want to download the Rejected Rows as a spreadsheet with an error column, so that I can fix them in Excel or hand them to a colleague.
40. As an Importer, I want to be warned before leaving while there are unfixed Rejected Rows, since the report is not kept, so that I don't lose them by accident.

### Host App developer

41. As a Host App developer, I want to describe an Output Shape once, including which fields are Relationship Fields and what kind of Related Record each points to, so that the same wizard serves every import entry point.
42. As a Host App developer, I want to supply option lists for choice fields from my API at runtime, so that they never drift from what my backend accepts.
43. As a Host App developer, I want to implement a small adapter (look up Related Records, create Related Records, save a batch), so that Data Weaver owns the import flow and I only own persistence.
44. As a Host App developer, I want lookups called once per Related Record type with the distinct normalised values, so that my backend receives about 40 calls' worth of work, not 800.
45. As a Host App developer, I want the creation of new Related Records to happen once each, before any rows are saved, so that concurrent batches can never duplicate them.
46. As a Host App developer, I want every row to carry a stable Import Key that stays the same across retries, so that I can ignore a row I've already saved.
47. As a Host App developer, I want to answer each batch with one outcome per row (created, or rejected with a reason and optional field), so that the Importer sees precise errors.
48. As a Host App developer, I want to be told the final outcome: created, rejected and excluded rows, so that I can refresh my UI, log or notify.
49. As a Host App developer, I want to pass my own translations as a message catalogue, with English defaults for anything I don't override, so that I can use my existing i18n setup.
50. As a Host App developer, I want to set the batch size, so that batches fit my backend's limits.
51. As a Host App developer, I want props like title, description, accepted file types and maximum file size either to work or not to exist, so that the API doesn't lie to me.
52. As a Host App developer, I want the README to describe only features that exist, so that I can trust it when integrating.

### Maintainer

53. As a maintainer, I want lint and tests to gate every deploy, so that a broken build never reaches the demo site.
54. As a maintainer, I want the review step split into focused parts, so that Resolution and Fix & Retry can be added without growing a 700-line component.
55. As a maintainer, I want value coercion and find/replace matching in the core logic layer, so that it's tested once and reused.
56. As a maintainer, I want the demo site to run the full flow against a simulated Host App, so that anyone can see Resolution, Commit and Fix & Retry working.

## Implementation Decisions

### Groundwork (prerequisites)

- The review step is split into focused parts (grid, toolbar, row, summary/actions) before Resolution and Fix & Retry are built on it.
- Value coercion, find/replace matching and the row-edit type move into, or are consolidated in, the core logic layer. One implementation is shared by cell edits, find/replace and AI Edit.
- Keyboard shortcuts:
  - Redo accepts both `z` and `Z` with Shift held.
  - Undo/redo shortcuts are ignored while focus is in a text input or textarea.
- Advertised wizard props either work or are removed:
  - title, description, accepted file types, maximum file size;
  - the upload step's help text must not claim HTML support.
- Advertised features that don't exist are removed from both READMEs and the UI copy: TSV/TXT support (unless implemented), encoding detection, visual confidence indicators, "AI-powered" matching, the PDF path. The two READMEs are consolidated into one.
- Dates are parsed explicitly: ISO dates as UTC calendar dates, and a documented day-first/month-first rule for ambiguous formats. They are never parsed in local time.
- CI runs lint and tests before the demo deploy. The existing lint errors are fixed.

### Output Shape

- A field can be a **Relationship Field**. It declares the kind of Related Record it points to (e.g. a Registry entry). Several fields can point to the same kind (author, owner and lender all point to Registry entries); Resolution groups their values together per kind.
- A field can be a **choice field** whose options come either from a static list or from an async loader supplied by the Host App.
  - Options are loaded once, when review starts.
  - A cell value that is a Normalised Match of an option is converted to that option's canonical value.
  - Any other value is an error on that cell.
  - Choice cells are edited with a list of the options.
- The Output Shape stays the single source of truth for required fields (already true).

### Host App adapter

The contract every Host App implements (enforced for SpeakArt via its backend changes):

- **Look up Related Records:** called once per Related Record kind, with the distinct normalised values from the whole file. For each value it returns zero or more existing candidates. Each candidate has an ID, a display name, a short distinguishing description (e.g. birth year) and whether it is a Normalised Match or only a Possible Match. More than one Normalised Match means Homonyms. The Host App matches with the same normalisation rule (below).
- **Create Related Records:** called at the start of Commit with the names chosen in Resolution, once per new Related Record, sequentially. Returns an ID or a failure reason for each.
- **Save a batch:** called with rows, each carrying its Import Key, its row number and its record, with Relationship Fields holding Related Record IDs, never names.
  - It must return exactly one outcome per row: created, or rejected with a reason and optional field.
  - It must ignore rows whose Import Key it has already saved and report them as created (ADR-0002).
- The adapter is required to complete an import. The earlier hand-off-only completion callback is replaced by an import-finished callback that receives the Import Report. This is a breaking change before 1.0, accepted.

### Resolution

- **Normalised Match rule** (shared by Data Weaver and the Host App): Unicode-decompose, strip diacritics, lowercase, collapse runs of whitespace, trim.
- **Possible Match suggestions** cover two cases:
  - pairs of distinct values within the file that differ by word order or punctuation (`Fontana, Lucio` / `Lucio Fontana`), or where initials match full names (`L. Fontana`);
  - Possible Match candidates returned by the Host App's lookup.

  They are never merged without the Importer's confirmation.
- **Stored name for a new Related Record:** the most frequent original spelling, preferring a spelling with accents when variants differ only by accents. Editable by the Importer.
- **Homonyms** block Commit until decided. The choice is made per value, with per-row overrides.
- **Grouping:** values of every Relationship Field pointing to the same kind are resolved together, so a value used in several fields is decided once.
- **Timing:** Resolution is a pure decision step; nothing is created before Commit (ADR-0001). Lookups may run when Resolution opens.

### Commit

- **Order:**
  1. Create the new Related Records.
  2. Substitute IDs into rows.
  3. Save the rows in batches.

  The batch size is set by the Host App (default 100). Batches are sent one at a time by default.
- **Import Key:** a random unique ID generated per row when the file is parsed, stable for the life of the import, including every retry and Fix & Retry.
- **Automatic retry:** a batch that fails in transit (a network error, a timeout, or a server error with no per-row outcomes) is retried automatically a small number of times with backoff. After that, its rows become Rejected Rows with an "unreachable" reason.
- **Dependent rows:** rows that depend on a Related Record that failed to be created become Rejected Rows, and the reason names that Related Record.
- **Excluded Rows** are never sent.

### Import Report, Fix & Retry

- **Import Report:** counts of imported, rejected and excluded rows, then the Rejected Rows list (row number, reason, field) and a separate Excluded Rows list.
  - It offers a download of the Rejected Rows as a spreadsheet: the original columns plus an error column.
  - It is not persisted. Leaving with unfixed Rejected Rows asks for confirmation.
- **Fix & Retry** reuses the review grid, filtered to the Rejected Rows:
  - errors are pinned to their cells (the whole row when no field is given);
  - imported rows are locked and hidden;
  - committing again sends only these rows, with their original Import Keys, after re-resolving only the Relationship Field values that are new or changed.

### Message catalogue

- **Coverage:** every string the Importer can see comes from a catalogue: labels, buttons, empty states, validation messages and report text.
- **Overrides:** the Host App passes a partial catalogue; missing keys fall back to English.
- **Entry format:** an entry is either a string with named placeholders or a function of its parameters. Functions let Host Apps apply their own plural rules via their i18n library.
- **Scope:** Data Weaver ships English only (Q9).

### Grid scale

- The review grid is virtualised and replaces pagination.
- The 10k-row target (Q10) covers scrolling, in-place editing, search, find/replace, filters and undo/redo.
- Undo history keeps sharing unchanged row objects between snapshots, so 50 levels on 10k rows stays within normal browser memory.

### Demo site

- The demo uses an in-memory simulated Host App adapter with sample Related Records, including a Homonym and a Possible Match. It can be made to reject a row and to lose a batch, so every path is demonstrable.
- There is no AI Edit on the demo (Q26).

## Testing Decisions

- **What a good test is:** it drives the wizard the way an Importer would and asserts only on observable outcomes: what the Host App adapter received, and what the Importer sees. It does not assert on component internals, state shape, or which function was called in between. Each bug fix or feature gets a test that fails without it (as done for the P0 fixes).
- **Main seam: the wizard with a fake Host App.** Render the wizard exactly as a Host App would, with an Output Shape and a fake adapter backed by an in-memory store.
  - The fake can hold existing Related Records, including Homonyms and Possible Matches.
  - It honours Import Keys and can reject chosen rows with reasons.
  - It can lose a batch after saving it, and can fail to create a chosen Related Record.

  Tests cover:
  - Resolution groups and decisions, including per-row Homonym overrides;
  - no creation before Commit;
  - each new Related Record created exactly once, even across fields;
  - retries after a lost batch not duplicating rows;
  - the Import Report contents;
  - Fix & Retry re-sending only Rejected Rows with their original Import Keys;
  - message overrides appearing in the UI;
  - choice fields normalising and flagging values.

  Prior art: the existing wizard component tests (parser mocked, Testing Library).
- **Secondary seam: the core logic layer**, only for rules with many combinations:
  - the Normalised Match rule (case, spacing, accents);
  - Possible Match detection (word order, initials, punctuation);
  - stored-name selection (most frequent, accent-preferring);
  - distinct-value collection across Relationship Fields;
  - batching and retry decisions.

  Prior art: the existing core logic tests (validator, matcher, required fields).
- **Scale:** a 10k-row test asserts the grid renders only a window of rows and that an edit plus undo on row 9,000 works. Performance is also checked by hand in a browser on the demo with a 10k-row file.
- **Package check:** the packed package is installed into a scratch host with no Tailwind, and the full flow is exercised in a browser, as done for P0.
- **Not tested here:** the SpeakArt backend. This spec only defines the contract; SpeakArt's repos test their implementation.

## Out of Scope

- Updating existing records: Commit is create-only (Q15).
- Multi-sheet imports; the Importer picks one sheet (Q23).
- Saved column mappings (Q22).
- Resuming an import after the tab is closed; the Import Report is not persisted (Q14e).
- Enabling AI Edit in SpeakArt, and hardening an AI endpoint (Q25).
- Files of 100k+ rows or streaming parsing (Q10).
- Shipping translations; Data Weaver ships English defaults only (Q9).
- Guarding against two Importers creating the same new Related Record at the same moment. That is the Host App's job (ADR-0001).
- The SpeakArt side, which is a separate spec in the SpeakArt repos:
  - the backend changes: per-row outcomes, honouring Import Keys, removing the silent abandon, the normalised lookup that returns Homonyms instead of crashing, and the shipper/author bug;
  - the SpeakArt frontend adapter, and replacing `react-csv-importer` at each entry point.
- Publishing to a registry. The package name and registry are still an open decision; `npm pack` tarballs are the delivery mechanism until then.

## Further Notes

- **SpeakArt's current state** (verified in code): `csvImportCreateAsset` returns only successful rows, counts failures without reasons, has one branch that silently abandons the rest of the request, creates shippers from the author's name, and uses plain `get_or_create` on Registry names that are not unique. Its admin-only Art Defender importer already takes the oldest match on duplicate names; the SpeakArt spec should consolidate on the Homonym-aware lookup instead.
- **Order of work:** Groundwork first, then Output Shape extensions and the adapter contract. After that, Resolution, then Commit with Import Report, then Fix & Retry. The message catalogue and the virtualised grid are independent and can run in parallel after Groundwork.
- **Start of the milestone:** the P0 work (row exclusion, `WizardRoot`, package build, Host App-supplied AI Edit) is done but uncommitted on the current branch. This spec assumes it lands first.
