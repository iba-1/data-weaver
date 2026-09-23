# 17: Demo site shows every path

**What to build:** Anyone visiting the demo site can walk through the whole flow against a simulated Host App: sample Registry entries including a Homonym and a Possible Match, and switches to make it reject a row or lose a batch, so Resolution, Commit, retries, the Import Report and Fix & Retry are all demonstrable.

**Blocked by:** 10 (Commit survives network failures), 12 (Fix & Retry), 14 (Homonyms), 15 (Possible Matches)

**Status:** ready-for-agent

Spec: `../spec.md`

- [ ] The simulated Host App holds sample Registry entries, including a Homonym and a Possible Match
- [ ] The demo offers switches to reject a chosen row and to lose a batch
- [ ] The demo has no AI Edit
- [ ] A sample spreadsheet exercising every path is downloadable from the demo
- [ ] Checked by hand on the deployed demo; findings noted on the ticket
