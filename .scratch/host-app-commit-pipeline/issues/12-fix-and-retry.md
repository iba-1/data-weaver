# 12: Fix & Retry

**What to build:** From the Import Report, an Importer opens Fix & Retry: only the Rejected Rows, with each error pinned to its cell (or the whole row when no field is given). Imported rows are locked and hidden. They fix or exclude rows and commit again; only those rows are sent, with their original Import Keys.

**Blocked by:** 09 (Commit tracer bullet: save rows through the Host App adapter)

**Status:** ready-for-agent

Spec: `../spec.md`

- [ ] Fix & Retry shows only the Rejected Rows, with errors on the offending cells
- [ ] Imported rows cannot be edited or re-sent
- [ ] Rejected Rows can be excluded in Fix & Retry
- [ ] Re-committing sends only the fixed rows, with their original Import Keys
- [ ] The Import Report updates to reflect the new outcomes
- [ ] Tests use the fake Host App adapter to reject rows on the first Commit and accept them on the retry
