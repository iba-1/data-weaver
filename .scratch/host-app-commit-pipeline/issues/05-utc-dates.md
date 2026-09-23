# 05: Timezone-proof date parsing

**What to build:** A date in the spreadsheet means the same calendar day for every Importer, whatever their computer's time zone.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] ISO dates are read as UTC calendar dates
- [x] Ambiguous formats (e.g. 01/02/2024) follow one documented rule (day-first vs month-first) chosen and stated in the README
- [x] Unparseable dates are a cell error, not a silently shifted date
- [x] Core tests run under at least two different time zones and produce the same results
