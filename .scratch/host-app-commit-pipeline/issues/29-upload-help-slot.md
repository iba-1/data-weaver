# 29: Room for the Host App's help next to the upload

**What to build:** The upload step has room for the Host App's own help: what each column may contain, answers to common questions, a link to an example file. Data Weaver shows whatever the Host App passes there and doesn't write the help itself, because only the Host App knows its rules and speaks its users' language. Asked by SpeakArt on 2026-09-30: its old importer showed, under the drop area, a download link for an example file, two FAQ answers and a table of the values each limited column accepts, and the Importer needs the same before uploading.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `ImportWizard` takes `uploadHelp?: ReactNode`, shown on the upload step under the drop area (and nowhere else); nothing is shown when it's absent
- [ ] The Host App's content keeps the Host App's own styling: nothing from Data Weaver's stylesheet restyles it (the library build has no preflight, and `.dw-root` rules only hit Data Weaver's own classes; a test renders a plain `<table>` / `<a>` / `<h2>` in the slot and checks no Data Weaver class or rule applies)
- [ ] The upload step scrolls when the help is taller than the space, with the drop area staying on top
- [ ] Exported helper `acceptedValues(fields)`: for every choice field of an Output Shape, its label and its options (value and label), so a Host App can build its "accepted values" table from the same Output Shape it passes to the wizard and the two never drift
- [ ] Tests: the slot renders only on the upload step; `acceptedValues` lists choice fields with their options and skips the rest
- [ ] README: the slot and the helper, with an example
