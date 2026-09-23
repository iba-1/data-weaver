# 02: Split the review step and move value handling into core

**What to build:** Prefactor with no visible change: the review step is split into focused parts (grid, toolbar, row, summary/actions), and value coercion, find/replace matching and the row-edit type exist once in the core logic layer, shared by cell edits, find/replace and AI Edit. This makes Resolution, Fix & Retry and the virtualised grid easy to add.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `../spec.md`

- [ ] The review step behaves exactly as before: all existing wizard and core tests pass unchanged
- [ ] Number/empty-value coercion has a single implementation in core, used by cell edits, find/replace and AI Edit
- [ ] Find/replace matching (case, whole word, column) lives in core with its own tests
- [ ] One shared row-edit type is used by AI Edit and the review step
- [ ] No review-step part exceeds a size a reader can hold in their head (the former single component is gone)
