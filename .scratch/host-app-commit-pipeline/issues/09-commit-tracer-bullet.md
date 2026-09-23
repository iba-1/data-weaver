# 09: Commit tracer bullet: save rows through the Host App adapter

**What to build:** An Importer completes an import and the rows are actually saved by the Host App, in batches, then sees an Import Report. The Host App implements a save-a-batch adapter and receives an import-finished callback with the Import Report, replacing the old onComplete hand-off. (ADR-0002)

**Blocked by:** 02 (Split the review step and move value handling into core), 07 (Message catalogue)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] Every row gets an Import Key when the file is parsed, stable for the life of the import
- [x] Commit sends included rows in batches (default 100, Host App-configurable), one batch at a time; Excluded Rows are never sent
- [x] Each batch answer is one outcome per row: created, or rejected with a reason and optional field; rejected rows become Rejected Rows
- [x] Progress is shown while committing
- [x] The Import Report shows imported / rejected / excluded counts, the Rejected Rows (row, reason, field) and a separate Excluded Rows list
- [x] The Host App receives an import-finished callback with the Import Report; the old onComplete is removed and the README updated
- [x] The demo uses a basic in-memory simulated adapter
- [x] Report strings come from the message catalogue
- [x] Tests use a fake Host App adapter (in-memory store honouring Import Keys, able to reject chosen rows)
- [x] The packed package is installed into a scratch host without Tailwind and the flow works in a browser
