# 14: Homonyms

**What to build:** When a value matches several existing Related Records, the Importer sees them with distinguishing details (e.g. birth year), picks one or chooses to create a new one, and can assign individual rows to a different record. Commit is blocked until every Homonym is decided.

**Blocked by:** 13 (Resolution tracer bullet: matched and will-be-created)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] A 'several matches' group lists each Homonym with its candidates' distinguishing details
- [x] The Importer picks one candidate or 'create new' per value
- [x] Individual rows of a value can be assigned to a different candidate
- [x] Commit is blocked while any Homonym is undecided
- [x] Tests use a fake Host App holding two Registry entries with the same name

**Decided:** per value, "create new" means one new record for every row assigned to it (by the value's choice or its own), created once with the value's name. Rows that are different new people get different names in the review.
