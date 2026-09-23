# Data Weaver: Purpose and Scope

- **Date:** 2026-09-23
- **Status:** agreed, from a design interview
- **Vocabulary:** see [`CONTEXT.md`](../../CONTEXT.md)
- **Key decisions:** [ADR-0001](../adr/0001-resolve-related-records-before-commit.md), [ADR-0002](../adr/0002-host-apps-must-honour-import-keys.md)

## Purpose

Data Weaver is a **general-purpose React library** that lets **non-technical people** (Importers, typically gallery, archive or collection staff) turn messy spreadsheets into validated records for any tabular data model a **Host App** defines.

**SpeakArt is the first Host App.** Data Weaver will replace `react-csv-importer` at every SpeakArt import entry point, starting with **collection asset import**. The public GitHub Pages site is the library's **live demo** and documentation.

## Decisions

### Product and users
| # | Decision |
|---|---|
| Q1 | A general-purpose library, with SpeakArt as its first integration. |
| Q2 | Importers are non-technical art-world staff migrating legacy spreadsheets. |
| Q3 | Any tabular data. Host Apps configure multiple Output Shapes. |
| Q24 | Replace every SpeakArt entry point (about 8), collection asset import first. |
| Q26 | The GitHub Pages site is the live demo, with a simulated Commit and no live AI Edit endpoint. |

### Output Shapes and input
| # | Decision |
|---|---|
| Q6 | A row becomes one Output Shape's record, which can include Relationship Fields (e.g. author and owner → Registry). The Host App's backend creates the records. |
| Q13 | The Host App fixes the Output Shape per entry point; the Importer never chooses. |
| Q23 | One sheet per import. For multi-sheet workbooks, the Importer picks the sheet. |
| Q22 | No saved column mappings for now. |
| Q29 | Output Shapes are hand-written by the Host App developer. Enum option lists are loaded live from the Host App so they never drift. |
| Q10 | 1k rows is typical. A 10k-row file must stay fully usable: scrolling, editing, search, undo. |

### Resolution (see ADR-0001)
| # | Decision |
|---|---|
| Q11/Q17 | Each distinct Relationship Field value in the whole file is resolved once, before Commit. Batches carry IDs, not names. |
| Q12/Q16 | A Normalised Match (ignoring case, extra spaces and accents) is merged automatically. Possible Matches are merged only if the Importer confirms. Stored names keep the original spelling. |
| Q18 | New Related Records are created only when Commit starts, once each. |
| Q19 | The Resolution step shows all four groups in full: matched, Homonyms, will be created, and Possible Matches. |
| Q20 | A new Related Record takes the most frequent spelling in the file, preferring accented; the Importer can edit it. |
| Q27 | The Homonym choice is per value, with a per-row override. |
| Q28 | The grid keeps the original cell text, with a badge linking to the resolved Related Record. |

### Commit and failures (see ADR-0002)
| # | Decision |
|---|---|
| Q7 | Data Weaver owns Commit: batched saves through the Host App's save function, with progress, and rejections returned to the grid. |
| Q15 | Create-only. Rows matching an existing record are rejected by the Host App. |
| Q8 | Invalid rows block Commit until they are fixed or explicitly excluded. Excluded Rows are reported, never dropped silently. |
| Q14a | Partial success: everything savable is saved, then comes the Import Report, then Fix & Retry. |
| Q14b | Every row carries an Import Key, and the Host App ignores repeats, so automatic retries are safe. |
| Q14c | The Host App returns one outcome per row: created, or rejected with a reason and field. |
| Q14d | The Rejected Rows can be downloaded as a spreadsheet with an error column. |
| Q14e | Fixing is not resumable after the tab closes; the download is the record. |
| Q21 | The Import Report lists Rejected Rows and Excluded Rows separately. Only Rejected Rows go to Fix & Retry. |

### Platform
| # | Decision |
|---|---|
| Q4 | AI Edit is an optional add-on, off unless the Host App enables it and supplies its own endpoint. |
| Q25 | AI Edit is off at SpeakArt launch. |
| Q9 | All interface text is translatable through a message catalogue supplied by the Host App, with English defaults and no i18n library dependency. |
| Q30 | Self-contained: Data Weaver ships its own compiled, scoped CSS, themed by the Host App through CSS variables. The Host App needs no Tailwind. |

## Explicitly out of scope (for now)

- Updating existing records.
- Multi-sheet imports.
- Saved column mappings.
- Resumable import sessions.
- AI Edit at SpeakArt launch.
- Files of 100k+ rows.

## Changes required in SpeakArt (the Host App)

These are backend changes, in `speakart-backend-api`, `csvImportCreateAsset`:
1. Return one outcome per row, with a reason and field. Today only successes are returned and failures are merely counted.
2. Accept an Import Key and ignore rows it has already saved.
3. Remove the `break` that silently abandons the rest of a request.
4. Provide a Related Record lookup using normalised matching, returning every candidate (Homonyms) instead of crashing with `MultipleObjectsReturned`.
5. **Existing bug:** the shipper is created from the author's name (`get_or_create(full_name=data["author"])` in the shipper branch).
