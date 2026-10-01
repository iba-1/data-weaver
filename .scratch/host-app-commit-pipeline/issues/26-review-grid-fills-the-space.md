# 26: The review grid fills the space it's given, like a spreadsheet

**What to build:** The review step's grid uses all the width and height the Host App gives the wizard, the way a spreadsheet fills its window: columns spread across the available width and scroll sideways when they don't fit, rows fill the height down to the step's buttons. Asked by SpeakArt on 2026-09-30: inside its full-screen drawer the grid sits in a 896px column with white space on both sides and below, and shows five columns of a 15-field Output Shape.

Today's limits:

- `ImportWizard.tsx`: the whole wizard is `max-w-4xl mx-auto` (896px)
- `review/ReviewGrid.tsx`: the grid is `max-h-[520px]`; every field column is `w-[180px]` in a `table-fixed w-full` table; the status column is `w-16`, so its header wraps (`Statu` / `s`) in a narrow layout
- `EditableCell.tsx` and `ChoiceCell.tsx`: cell text is truncated at `max-w-[180px]` whatever the column's width

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The review step (and Fix & Retry, which uses the same grid) takes the wizard's full width; the steps that read like forms (upload, mapping, resolution, report) keep a comfortable reading width
- [ ] Field columns have a minimum width (today's 180px) and share any extra width; with more columns than fit, the grid scrolls sideways and the page never does
- [ ] The row number and status columns stay pinned on the left while scrolling sideways, and the header stays pinned while scrolling down; no header wraps mid-word
- [ ] Cell text uses the column's width before truncating; the full value stays reachable (tooltip or on edit)
- [ ] Height: when the Host App gives the wizard a definite height (e.g. a full-screen drawer), the grid grows to fill it, down to the step's buttons, which stay visible; without one it keeps a sensible maximum (today's 520px) so it never grows past the window. Row virtualisation keeps working in both cases
- [ ] The demo and features pages show the grid in a full-height container
- [ ] Tests: the review step isn't width-capped; the grid's scroll container fills a sized parent and falls back to the maximum without one; pinned columns
- [ ] README: how to give the wizard its height (the container needs a definite height, e.g. `h-full` in a flex column)
