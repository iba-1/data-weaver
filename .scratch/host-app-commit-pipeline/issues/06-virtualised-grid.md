# 06: Virtualised review grid for 10k rows

**What to build:** An Importer can review a 10,000-row file: scrolling, editing a cell, search, find/replace, filters and undo/redo stay responsive. Pagination is replaced by a virtualised grid.

**Blocked by:** 02 (Split the review step and move value handling into core)

**Status:** ready-for-agent

Spec: `../spec.md`

- [ ] A 10k-row file renders only the visible window of rows
- [ ] Editing a cell far down the file (e.g. row 9,000) and undoing it works
- [ ] Search, find/replace and the error/warning/excluded filters work across all rows
- [ ] Undo history shares unchanged rows between snapshots (50 levels on 10k rows does not copy every row)
- [ ] Checked by hand in a browser on the demo with a 10k-row file; findings noted on the ticket
