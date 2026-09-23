# 06: Virtualised review grid for 10k rows

**What to build:** An Importer can review a 10,000-row file: scrolling, editing a cell, search, find/replace, filters and undo/redo stay responsive. Pagination is replaced by a virtualised grid.

**Blocked by:** 02 (Split the review step and move value handling into core)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] A 10k-row file renders only the visible window of rows
- [x] Editing a cell far down the file (e.g. row 9,000) and undoing it works
- [x] Search, find/replace and the error/warning/excluded filters work across all rows
- [x] Undo history shares unchanged rows between snapshots (50 levels on 10k rows does not copy every row)
- [x] Checked by hand in a browser on the demo with a 10k-row file; findings noted on the ticket

## Notes

**Approach.** `@tanstack/react-virtual` (v3, now a runtime dependency; `build:lib` keeps it external, and a packed tarball installed into a scratch project resolves and renders it). Rows have a fixed height (`REVIEW_ROW_HEIGHT` = 45px, compact `px-3 py-2` cells); the table uses spacer rows above and below the rendered window, keeps a native sticky `thead`, and `table-fixed` column widths so columns don't jump while scrolling. Overscan is 10 rows each side. Pagination and "Showing x-y of z" are gone; the grid shows "N rows" or "N of M rows" while a filter or search narrows it. Changing the filter or search scrolls back to the top.

**Open editor scrolled out of view: it commits.** Scrolling a row with an open cell editor far enough that it unmounts saves what was typed, the same as clicking away (blur already saves). `EditableCell` keeps the draft in a ref, so a save is never doubled (this also stops Enter/Tab followed by blur saving twice).

**Filters.** The summary now has an "Excluded" badge alongside Valid/Warnings/Errors, so an Importer can find the rows they left out in a 10k file.

**Undo history.** Already shared unchanged rows: every change maps the previous array and only replaces edited rows; snapshots hold the arrays, so 50 levels on 10k rows are 50 arrays of pointers (~4 MB), not 500k row copies. A test pins this (edit row 9,000: new array, one new row object; undo returns the previous array itself).

**Derived data.** Summary is one pass and memoised on `rows`; filtered rows and search counts are memoised on rows/filter/search; rows are `memo`ised so scrolling doesn't re-render rows that stay in view. Scrolling re-renders only the grid, never the toolbar or summary.

**Manual check (2026-09-23, Playwright Chromium, `vite` dev mode, 1400x1000, 10k-row artwork CSV with 40 error rows):**
- 22 rows in the DOM at the top (32 after jumping to row 9,000); measured row height exactly 45px; scroll height 450,048px (10k x 45 + header).
- Wheel scrolling 60 x 900px: no frame over 50ms; frame gaps identical to idle (this headless Chromium caps rAF at 30fps, so 33ms is its idle rate).
- Jump to row 9,000: rendered within 2 frames (34ms). Edit row 9,000: 38ms to show; Ctrl+Z: 15ms.
- Search while typing "Artist 12" (275 of 10,000 rows): no long tasks. Errors filter: 76ms, 22 of the 40 rows rendered. Exclude Errors: no long tasks. Excluded filter: 40 rows.
- Find & Replace over all 10,000 cells: 223ms including revalidation; undo 14ms.
- Open editor, scroll 5,000 rows away and back: the typed value was saved; Ctrl+Z restored it.
- Tab from a cell 120 times: focus walked down the rows and the grid scrolled to follow it.
- The demo page logs every wizard event to the console (10,000 ROW_COMPLETE entries on load and per bulk edit), which dominates timings when a console is attached (replace-all took ~1s with Playwright capturing the console vs 223ms without). That's the demo page, not the library.
- Pre-existing, not changed here: after Enter/Escape in a cell editor focus falls to the page body rather than back on the cell.
