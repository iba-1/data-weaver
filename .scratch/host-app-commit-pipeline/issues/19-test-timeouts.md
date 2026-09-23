# 19: Reliable local test runs under load

**What to build:** A maintainer running the checks on a busy machine gets a result they can trust. The component tests render the whole wizard in jsdom. When the machine is heavily loaded (load average 30–70 was observed), the first test in a file can take more than Vitest's default 5 s and fail with a timeout, even though nothing is wrong, while CI passes. The local check commands also kept running after a failure, which let a red run go unnoticed before a merge.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] Test timeouts fit integration-style component tests on a loaded machine (a real hang still fails)
- [x] A single `npm run check` runs lint, type-check, tests (UTC and two more time zones) and both builds, and stops at the first failure
- [x] Measured before/after: repeated full runs under load, with the results recorded here

## Notes

Measured on 2026-09-23. The laptop also ran Docker, a VM and other agents, with a load average of 30–65.

| Setting | Full `vitest run`, 3 times in a row |
|---|---|
| Vitest default (5 s test timeout, 1 s async queries) | 2 of 3 runs failed: 21 and 14 failed tests, all timeouts |
| 30 s test/hook timeout, 5 s async queries | 3 of 3 runs passed, 0 timeouts (load 48 → 65 during the runs) |

- **Slowest tests under load:** up to 20.5 s (choice-cell picker, find/replace, undo in the dialog). The median test takes about 1 ms. The slowness comes from CPU contention; no test hangs. A real hang still fails at 30 s.
- **`npm run check`:** passed end to end (lint, type-check, tests in UTC, New York and Tokyo, both builds). It stops at the first failure.
