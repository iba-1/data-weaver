# 03: Undo/redo shortcuts that behave

**What to build:** An Importer can redo with Ctrl/Cmd+Shift+Z or Ctrl+Y, and pressing undo while typing in a cell, the search box or any text field undoes their typing, not the grid.

**Blocked by:** 02 (Split the review step and move value handling into core)

**Status:** ready-for-agent

Spec: `../spec.md`

- [ ] Ctrl/Cmd+Shift+Z redoes the last undone grid change
- [ ] Ctrl+Y redoes the last undone grid change
- [ ] Undo/redo shortcuts do nothing to the grid while focus is in a text input or textarea
- [ ] Tests cover each of the above through the wizard
