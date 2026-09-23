# 13: Resolution tracer bullet: matched and will-be-created

**What to build:** A Host App developer can mark fields as Relationship Fields pointing to a kind of Related Record. Before Commit, the Importer sees a Resolution step listing each distinct value once (across all fields of the same kind), grouped as matched existing or will be created. New Related Records are created once each at the start of Commit, and rows are saved with Related Record IDs instead of names. (ADR-0001)

**Blocked by:** 08 (Choice fields with live options), 09 (Commit tracer bullet: save rows through the Host App adapter)

**Status:** ready-for-agent

Spec: `../spec.md`

- [ ] Relationship Fields declare the kind of Related Record they point to; values of all fields of the same kind are resolved together
- [ ] Distinct values are collected across the whole file using the Normalised Match rule, with the folded spellings and row counts shown
- [ ] The Host App lookup is called once per kind with the distinct normalised values
- [ ] The 'matched existing' and 'will be created' groups are shown in full
- [ ] The stored name for a new Related Record defaults to the most frequent spelling, preferring the accented one, and is editable
- [ ] Nothing is created before Commit; abandoning the import creates nothing (fake adapter test)
- [ ] Commit creates each new Related Record exactly once, sequentially, before any row batch, even when the value appears in several fields
- [ ] Row batches carry Related Record IDs, never names
- [ ] Rows depending on a Related Record that failed to be created become Rejected Rows naming that record
- [ ] The grid keeps the original text with a badge naming the resolved Related Record
- [ ] The Importer can go back from Resolution to review
- [ ] Resolution strings come from the message catalogue
