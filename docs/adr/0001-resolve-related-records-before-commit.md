---
status: accepted
---

# Resolve Related Records once, before Commit

Rows reference other records by name (e.g. an Asset's author, a Registry entry), but a name is not an identity: SpeakArt's `Registry.full_name` is deliberately not unique because homonyms are legitimate and tenants already hold duplicates. So neither a database uniqueness rule nor Django's `get_or_create` can prevent duplicates. Django's docs state `get_or_create` is only race-safe when the database enforces uniqueness, so concurrent batches, retries or Importers can create the same person twice, and existing duplicates make it raise `MultipleObjectsReturned`. We therefore resolve every distinct Relationship Field value in the file once, in a Resolution step before Commit:
- The Host App looks the value up.
- The Importer settles Homonyms (per row if needed) and Possible Matches.
- Values are matched ignoring case, extra spaces and accents.
- New Related Records are created once each at the start of Commit, never earlier, so an abandoned import leaves nothing behind.

Record batches carry Related Record IDs, never names.

## Considered Options

- **Send names and let the backend get-or-create, committing batches one at a time.** Rejected: it still crashes on existing duplicates, gives the Importer no view of Homonyms, and doesn't protect against retries or concurrent Importers.
- **Add a uniqueness rule on the name.** Rejected: it's wrong for the domain, because homonyms exist.

## Consequences

- Host Apps must provide a lookup that applies the same normalised matching (case, whitespace, accents).
- The only remaining race is two Importers creating the same new Related Record at the same moment. Guarding it is the Host App's job (e.g. a lock on the normalised name), not Data Weaver's.
