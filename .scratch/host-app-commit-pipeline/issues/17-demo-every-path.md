# 17: Demo site shows every path

**What to build:** Anyone visiting the demo site can walk through the whole flow against a simulated Host App: sample Registry entries including a Homonym and a Possible Match, and switches to make it reject a row or lose a batch, so Resolution, Commit, retries, the Import Report and Fix & Retry are all demonstrable.

**Blocked by:** 10 (Commit survives network failures), 12 (Fix & Retry), 14 (Homonyms), 15 (Possible Matches)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] The simulated Host App holds sample Registry entries, including a Homonym and a Possible Match
- [x] The demo offers switches to reject a chosen row and to lose a batch
- [x] The demo has no AI Edit
- [x] A sample spreadsheet exercising every path is downloadable from the demo
- [x] Checked by hand on the deployed demo; findings noted on the ticket

## Notes

**What was built.** `src/pages/demo/`: `hostApp.ts` (the Archivio Serra, an in-memory Host App: registry with two Mario Rossi Homonyms, Possible Matches flagged with the library's `isPossibleMatch`, Import Keys honoured, create-only, "Refuse a title" and one-shot "Lose the next batch's answer" switches, observable via `subscribe`/`getSnapshot`), `outputShape.ts` (title, artist + owner → registry, year, technique, acquired on (date), value, currency (choice, loaded from the Host App with latency); the 12-row Italian sample and its path table), `HostAppConsole.tsx` (switches, rows per batch 3/5/100, store with a from-data "saved twice" check, latest Import Report, activity log of adapter calls and wizard events), `events.ts`, `demo.css`. No `aiEdit` is passed.

**Sample file.** Generated in the browser on click from `SAMPLE_ROWS` with the library's `sheetToBlob` (no binary committed, so it cannot drift from the data; `sample.test.ts` reads the downloaded bytes back through `parseFile` and checks every path is really in it).

**Walked in Chromium (Playwright), `npm run dev`, 2026-09-23.** Screenshots in `.context/ticket-17/` (not committed).
1. Download: `archivio-serra-sample.xlsx`, 12 rows, read back with SheetJS: as intended.
2. Upload: all 8 Italian headers auto-matched. Review: 11 valid, 1 error (row 11, no title). `03/04/2001` shown as 2001-04-03, `01/02/1999` as 1999-02-01; `eur`/`Euro`/`euro` → EUR, `US dollar` → USD. No AI Edit button anywhere.
3. Excluded row 11. Resolution: Several matches (Mario Rossi, 2 candidates with descriptions), Possibly the same (L. Fontana → Lucio Fontana already in the system; "Manzoni, Piero" → Piero Manzoni in the file), Matched existing (3), Will be created (Piero Manzoni; Anna Bianchi with spellings Anna Bianchi ×3, anna bianchi ×1, used as artist and owner). Import blocked until Mario Rossi decided. Chose b. 1950, row 8 → b. 1987, merged both Possible Matches.
4. Switched on "Refuse a title" (Senza titolo) and "Lose the next batch's answer", 3 rows per batch. Import: `createRelated` Piero Manzoni and Anna Bianchi once each; batch 1 saved then lost; the wizard showed "Connection problem, retrying… (attempt 2 of 3)"; retry answered "0 saved, 3 already saved (Import Key)"; switch turned itself off. Report: 10 imported · 1 rejected (row 8, reason on Title) · 1 excluded (row 11). Store: 10 artworks, registry 6 + 2 new, 3 repeats ignored, none saved twice; row 7 → Mario Rossi [reg-3], row 8 → [reg-4].
5. Download rejected rows: `archivio-serra-sample - rejected rows.xlsx` with the original Italian columns + Error "Title: The archive does not accept …". Fix & Retry: only row 8 shown, Homonym badge kept (b. 1987); retitled to "Senza titolo (blu)", Retry import: 1 row saved; report 11 imported · 0 rejected · 1 excluded; store 11 artworks, no duplicates.
6. Also: same run with 5 rows per batch (lost batch retried, no duplicates); "Import another file into the same archive" with the same sample: Anna Bianchi and Piero Manzoni now Matched existing; unchanged rows rejected "already in the collection"; the browser's `beforeunload` guard fired when navigating away with Rejected Rows.
7. Layout at 1440, 1024 (console stacks under the wizard) and 390 px.

**Not verified / follow-ups.**
- The deployed GitHub Pages demo (needs the merge; check the `/data-weaver/` base path and Google Fonts load there).
- At 390 px the wizard's own step indicator is wider than the screen (page scrolls sideways to 493 px). That is the library's layout, not the demo page's; left alone per "do not restyle the library". Worth a ticket.
- "Refuse a title" is an exact (normalised) title match rather than "contains", so the refused row can be fixed in Fix & Retry by retitling it.

### Deployed demo (2026-09-23, after PR #18)

Walked on https://iba-1.github.io/data-weaver/ in Chromium at 1280×900, with no console errors:
- **Sample file:** downloaded from the page and uploaded to the wizard.
- **Review:** day-first dates became ISO dates, `eur`/`Euro` became `EUR`, and row 11 (no title) was excluded with Exclude Errors.
- **Resolution:** picked Mario Rossi (b. 1950), merged L. Fontana with the existing Lucio Fontana, and merged "Manzoni, Piero" with Piero Manzoni.
- **Commit:** with "Refuse a title" and "Lose the next batch's answer" armed, the result was 10 imported · 1 rejected · 1 excluded. The store showed "No artwork saved twice: 3 repeated rows were recognised by Import Key" and the registry grew from 8 to 10 (+2 new).
- **Fix & Retry:** retitled row 8 "Senza titolo (blu)" and pressed "Retry import (1 row)". The result was 11 imported · 0 rejected. The store held 11 artworks, and the registry stayed at 10 (nothing created twice).

