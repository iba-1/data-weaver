# 07: Message catalogue

**What to build:** An Importer sees the whole wizard in their language: every label, button, empty state, validation message and summary comes from a message catalogue. The Host App passes a partial catalogue; anything missing falls back to English.

**Blocked by:** 02 (Split the review step and move value handling into core), 04 (Honest API and docs)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] Every Importer-visible string comes from the catalogue; no hard-coded copy remains in the wizard
- [x] Entries can be strings with named placeholders or functions of their parameters (so Host Apps can apply plural rules)
- [x] Missing keys fall back to the English defaults
- [x] A test renders the wizard with an override catalogue and sees the overridden strings
- [x] The README documents the catalogue and lists its keys
