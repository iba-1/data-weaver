# 15: Possible Matches

**What to build:** The Importer is shown values that might be the same Related Record but aren't a Normalised Match (`Fontana, Lucio` / `L. Fontana` vs `Lucio Fontana`), both within the file and as flagged by the Host App lookup, and chooses to merge them or keep them separate. Nothing is merged without their confirmation.

**Blocked by:** 13 (Resolution tracer bullet: matched and will-be-created)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] Possible Matches within the file are detected for word order, punctuation and initials (core tests for each)
- [x] Candidates the Host App lookup flags as Possible Matches are shown
- [x] The default is keep separate; merging requires an explicit choice
- [x] A merged value resolves to the chosen Related Record for all its rows
- [x] Tests drive merge and keep-separate through the wizard
