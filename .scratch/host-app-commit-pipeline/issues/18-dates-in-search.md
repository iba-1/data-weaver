# 18: Search and find/replace treat dates as calendar dates

**What to build:** An Importer searching or using find/replace on a date field works with the date exactly as the grid shows it (`YYYY-MM-DD`). Today search and find/replace turn a date into text with `String(value)`, which produces a local-time string. So a search for `2024-01-15` misses the cell, and a replace on a date cell produces text that no longer parses and shows an error.

**Blocked by:** 02 (Split the review step and move value handling into core), 05 (Timezone-proof date parsing)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] Search matches date cells by their `YYYY-MM-DD` text
- [x] Find/replace on a date cell reads and writes the `YYYY-MM-DD` text, and the result is parsed back as a calendar date
- [x] Core tests for search and find/replace on date cells pass in UTC, America/New_York and Asia/Tokyo
