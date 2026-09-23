# 10: Commit survives network failures

**What to build:** If the connection drops mid-import, the Importer doesn't have to do anything: failed or lost batches are retried automatically and nothing is saved twice. Rows that still can't be sent are reported as Rejected Rows so they can be retried later.

**Blocked by:** 09 (Commit tracer bullet: save rows through the Host App adapter)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] A batch that fails in transit (network error, timeout, server error without per-row outcomes) is retried a small number of times with backoff
- [x] A batch saved by the Host App but whose answer was lost is retried with the same Import Keys and produces no duplicates (fake adapter test: lose a batch after saving it)
- [x] After the last retry, the batch's rows become Rejected Rows with an 'unreachable' reason
- [x] Retry count and backoff are covered by core tests
