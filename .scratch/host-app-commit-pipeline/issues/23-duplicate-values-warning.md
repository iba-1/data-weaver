# 23: Warn when a field's value repeats within the file

**What to build:** The Host App can mark a field as one whose value is expected to be unique within the file (e.g. an inventory number). Rows sharing a value get a non-blocking warning on that cell, naming the other rows, so the Importer can check them; both rows are still imported. Today `validate` and `validateRow` see only one row, so a Host App can't express this.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Requested by: `speakart-frontend/.scratch/data-weaver-import/issues/02-collection-import.md` (client answer #17: two rows with the same data may be different works, so warn, don't block)

- [ ] A field option, e.g. `unique: 'warning'` (with `'error'` reserved for later), documented in the README's `FieldConfig`
- [ ] Values are compared after type conversion and trimming, ignoring case; empty cells and Excluded Rows never count
- [ ] The warning is re-evaluated after every edit, exclusion and inclusion, and after undo and redo, on every row involved, not only the edited one
- [ ] The warning message is in the message catalogue (with plurals) and names the other row numbers
- [ ] Performance holds on 1,000+ rows (the client's typical file size)
- [ ] Unit tests, plus a component test that editing one duplicate clears the warning on both rows
