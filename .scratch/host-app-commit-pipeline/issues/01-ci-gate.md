# 01: CI gate: lint and tests before the demo deploys

**What to build:** Every push to main runs lint and the test suite before the demo site is built and deployed; a lint error or failing test stops the deploy. The existing lint errors are fixed so the gate starts green.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] The deploy workflow runs lint and tests before building, and a failure in either stops the deploy
- [x] The three pre-existing lint errors are fixed (no rules disabled to hide them)
- [ ] Lint and tests pass on CI for this change (checked on the CI run, not only locally)
