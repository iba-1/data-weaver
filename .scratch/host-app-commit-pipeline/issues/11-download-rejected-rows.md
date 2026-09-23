# 11: Download Rejected Rows and the leave warning

**What to build:** An Importer can download the Rejected Rows as a spreadsheet (original columns plus an error column) to fix offline or hand to a colleague, and is warned before leaving while Rejected Rows remain unfixed, since the Import Report is not kept.

**Blocked by:** 09 (Commit tracer bullet: save rows through the Host App adapter)

**Status:** ready-for-agent

Spec: `../spec.md`

- [ ] The Import Report offers a download of the Rejected Rows with the original columns plus an error column
- [ ] Leaving the wizard (navigation or closing the tab) with unfixed Rejected Rows asks for confirmation
- [ ] No confirmation is asked when there are no Rejected Rows
- [ ] Tests cover the file's contents and when the warning appears
