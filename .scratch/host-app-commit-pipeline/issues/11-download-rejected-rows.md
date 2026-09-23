# 11: Download Rejected Rows and the leave warning

**What to build:** An Importer can download the Rejected Rows as a spreadsheet (original columns plus an error column) to fix offline or hand to a colleague, and is warned before leaving while Rejected Rows remain unfixed, since the Import Report is not kept.

**Blocked by:** 09 (Commit tracer bullet: save rows through the Host App adapter)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] The Import Report offers a download of the Rejected Rows with the original columns plus an error column
- [x] Leaving the wizard (navigation or closing the tab) with unfixed Rejected Rows asks for confirmation
- [x] No confirmation is asked when there are no Rejected Rows
- [x] Tests cover the file's contents and when the warning appears

**Decisions:**

- **Format:** `.xlsx` whenever the Host App's `acceptedFileTypes` includes it (every cell stored as text, so Excel keeps leading zeros and doesn't re-read dates, as a CSV opened in Excel would); otherwise CSV (UTF-8 with BOM), otherwise `.xls`, so the file can always be uploaded again. Not "the upload's format": a CSV round-tripped through Excel is what loses data.
- **Edited values:** each cell is the uploaded text, except a field the Importer edited in review (its value differs from the record as the review opened), which is written as text into the column it came from. Unmapped columns keep their text; a field with no column that the Importer filled in gets its own column, headed by its label. Error column last.
- **Navigation inside the Host App:** Data Weaver can't block its router, so `onLeaveWarningChange(warn)` tells it when to guard (README shows React Router's `useBlocker`). Closing/reloading the tab: `beforeunload`, registered only while the report shows Rejected Rows.
