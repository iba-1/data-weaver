# 21: Fix & Retry offers merges with names committed earlier

**What to build:** A name the Importer types for the first time during Fix & Retry (e.g. "A. Bianchi") is offered as a Possible Match of names committed in the first Commit (e.g. "Anna Bianchi"), not only of the Host App's lookup and the other new names. Today it is compared only with those, so a duplicate record can be created for someone the file already named.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] In Fix & Retry, a new or changed Relationship Field value is offered as a Possible Match of values committed earlier (same kind), including ones whose record was created in the first Commit (merging links to that ID)
- [x] If the committed value's record failed to be created, merging makes both share the one creation attempt
- [x] Default stays keep separate; nothing is merged without the Importer's choice (ADR-0001)
- [x] Wizard test with the fake Host App: rename a rejected row's author to an initials form of a committed name, merge, retry: the row gets the committed record's ID and nothing is created

Notes: offers go one way only (new value into committed value; committed values are never offered anything nor decided again). A committed Homonym whose rows went to different records is not offered, since merging with it would be ambiguous. The label is the catalogue's `resolution.mergeWithCommitted` ("Merge with Anna Bianchi, from the earlier import").
