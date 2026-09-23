# 16: Fix & Retry re-resolves changed names

**What to build:** When an Importer edits a Relationship Field value in Fix & Retry (e.g. fixes a typo in an author's name), only the new or changed names go back through Resolution before re-committing; decisions already made are kept.

**Blocked by:** 12 (Fix & Retry), 13 (Resolution tracer bullet: matched and will-be-created)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] Changing a Relationship Field value in Fix & Retry triggers Resolution for that value only
- [x] Previously resolved values are not asked again
- [x] Unchanged Rejected Rows keep their earlier Related Record decisions
- [x] Tests cover a rejected row fixed by renaming its author
