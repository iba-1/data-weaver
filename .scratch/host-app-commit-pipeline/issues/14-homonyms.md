# 14: Homonyms

**What to build:** When a value matches several existing Related Records, the Importer sees them with distinguishing details (e.g. birth year), picks one or chooses to create a new one, and can assign individual rows to a different record. Commit is blocked until every Homonym is decided.

**Blocked by:** 13 (Resolution tracer bullet: matched and will-be-created)

**Status:** ready-for-agent

Spec: `../spec.md`

- [ ] A 'several matches' group lists each Homonym with its candidates' distinguishing details
- [ ] The Importer picks one candidate or 'create new' per value
- [ ] Individual rows of a value can be assigned to a different candidate
- [ ] Commit is blocked while any Homonym is undecided
- [ ] Tests use a fake Host App holding two Registry entries with the same name
