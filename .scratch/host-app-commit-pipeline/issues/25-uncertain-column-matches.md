# 25: Uncertain Matches are highlighted and must be confirmed

**What to build:** On the mapping step, a Column Match that Data Weaver proposed with a weak resemblance is shown in the warning colour (yellow), and the Importer must confirm it or pick another field before continuing. The Host App sets how weak "weak" is. Asked by SpeakArt on 2026-09-30: today every proposed Column Match gets the same green tick, whatever its score, so a header that only shares its first three letters with a keyword (e.g. `Valutazione` → `Valore`) looks as sure as an identical one.

The matcher already scores each proposal (`matcher.ts`): 1.0 when the header equals a keyword, 0.8 when it contains one or is contained in one, 0.6 when only the first three letters agree; below 0.5 nothing is proposed. The score is kept on `ColumnMapping.confidence` but never shown.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `ImportWizard` (and `ColumnMapper`) take `uncertainMatchBelow?: number`, default `0.7`: a proposed Column Match scoring below it is an Uncertain Match. With the default only the three-letter matches (0.6) are uncertain; `1` makes every non-identical match uncertain, `0` turns the feature off
- [ ] An Uncertain Match row uses the warning colour, with a badge (instead of the "auto" badge) and a Confirm button; its status icon is not the green tick
- [ ] Confirm, or choosing any field (including the same one, or "do not import") in the row's select, ends the Uncertain Match; the row then looks like any other Column Match
- [ ] Continue is disabled while an Uncertain Match is unconfirmed, with a line saying how many columns are left to check (like the missing-required-fields line)
- [ ] Every new text is a catalogue entry (`mapping.uncertainBadge`, `mapping.confirmMatch`, `mapping.uncertainPending({ count })`), nothing hard-coded, so a Host App can translate all of it
- [ ] Going back to the mapping step from review keeps confirmations; a new file starts over
- [ ] Tests: which scores are uncertain at the default, at `1` and at `0`; confirm and change end it; Continue stays disabled until every Uncertain Match is handled; the catalogue has the new entries
- [ ] README: the prop, the score scale above, and an example
