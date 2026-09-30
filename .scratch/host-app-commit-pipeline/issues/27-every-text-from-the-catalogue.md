# 27: Every text the Importer can see comes from the catalogue

**What to build:** A Host App can replace every piece of text Data Weaver shows, including error reasons and number formatting, so nothing reaches the Importer in English or in the browser's locale when the Host App uses another language. Asked by SpeakArt on 2026-09-30 ("the translation keys must all be settable by us"). An audit on `feat/number-separators` found the UI itself clean: every label, button, placeholder, aria-label and count is a catalogue entry. What's left:

- `lib/import-wizard/parser.ts:19`: `` `Unsupported file type: ${ext}` `` reaches the Importer as the `{reason}` of `upload.unreadable`
- `lib/import-wizard/choices.ts:155`: `'expected a list of { value, label } options'` reaches the Importer as the `{reason}` of `options.loadFailed`
- Counts (`review.rowCount`, filter badges, …) are formatted with `toLocaleString()`, i.e. the browser's locale, not the Host App's language

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] An unsupported file type has its own catalogue entry (e.g. `upload.unsupportedFileType({ extension })`), shown instead of `upload.unreadable` with an English reason. Errors thrown by the spreadsheet parser itself stay a `{reason}` (they come from a third party), documented as such
- [ ] Options that aren't a list of `{ value, label }` are reported with a catalogue entry (e.g. `options.malformed({ field })`), not an English reason; the developer detail goes to the `ERROR` event / console only
- [ ] `ImportWizard` takes `locale?: string` (a BCP 47 tag); numbers the wizard formats use it, falling back to the browser's locale when absent
- [ ] A test fails when a component under `src/components/import-wizard/` renders a literal string that isn't from the catalogue (JSX text, `placeholder`, `aria-label`, `title`), so this can't regress
- [ ] README: the full list of catalogue groups and the `locale` prop
