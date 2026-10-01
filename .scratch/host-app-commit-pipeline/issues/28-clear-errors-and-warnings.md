# 28: Errors and warnings say what's wrong without hovering

**What to build:** On the review step (and Fix & Retry), the Importer sees what is wrong, where and how many times, without hovering anything. Asked by SpeakArt on 2026-09-30 ("errors and warnings must be much clearer"). Today a row with an issue is only tinted, with an icon in the status column; the message is in a tooltip on that icon or on the cell (`review/ReviewRow.tsx`), and the counters above the grid ("2 Warnings") don't say what the warnings are.

**Blocked by:** 26 (the grid's width decides how much text fits in a row)

**Status:** ready-for-agent (look agreed on the `/proto` prototype, branch `proto/visual-25-29`, 2026-10-01)

- [ ] An issue list above the grid groups issues by message: kind (error / warning, in words as well as colour), the message, the field, how many rows, e.g. "Warning · Currency: missing, EUR will be used · 2 rows". Clicking a group filters the grid to those rows and scrolls to the first
- [ ] The status column shows the row's first message as text (truncated), plus "+N" when there are more, instead of an icon alone; the full list stays one hover or focus away
- [ ] The cell at fault is marked on its own (border and corner mark in the issue's colour), not only the row, so the Importer knows which cell to edit
- [ ] Errors and warnings are distinguishable without colour (icon shape and a word), for colour-blind Importers and screen readers (the row's issues are in its accessible name)
- [ ] Blocking and non-blocking look different in weight (decided 2026-10-01): an error is **Needs action** (strong: red box at the top titled with how many rows can't be imported, solid red counter, red row tint and left bar, a solid "Needs action" label in the status cell, the cell filled and outlined, "Fix or exclude N rows first" next to the disabled import button); a warning is a **note** (quiet: a dashed grey line "N notes · nothing blocking", collapsed by default; grey counter; no row tint; grey text in the status cell; only a small corner mark on the cell)
- [ ] "Mark all as OK" on the notes line: the current notes stop drawing attention (no marks, rows show the valid tick), with Undo; a note that appears after an edit shows again
- [ ] Every new text is a catalogue entry; the messages themselves stay the Host App's or the catalogue's
- [ ] Row height stays fixed, so virtualisation keeps working
- [ ] Tests: the list groups identical messages across rows and counts them; clicking a group filters; the status cell shows the first message and "+N"; the cell at fault is marked; accessible names include the issues
- [ ] The demo shows a file with several errors and warnings of each kind
