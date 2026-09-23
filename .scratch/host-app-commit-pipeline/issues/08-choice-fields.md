# 08: Choice fields with live options

**What to build:** A Host App developer can declare a choice field whose options come from a static list or from an async loader supplied by the Host App. For the Importer, values that clearly match an option are converted to it, others are flagged on the cell, and choice cells are edited with a picker. Introduces the shared Normalised Match rule.

**Blocked by:** 02 (Split the review step and move value handling into core)

**Status:** ready-for-agent

Spec: `../spec.md`

- [ ] The Normalised Match rule (Unicode-decompose, strip diacritics, lowercase, collapse whitespace, trim) exists in core with its own tests
- [ ] Options load once when review starts; a loader failure is shown to the Importer and blocks completion
- [ ] A cell whose value is a Normalised Match of an option (e.g. `eur` for `EUR`) becomes the option's canonical value
- [ ] Any other value is an error on that cell
- [ ] Choice cells are edited with a picker listing the options
- [ ] Tests drive this through the wizard with a fake Host App loader
