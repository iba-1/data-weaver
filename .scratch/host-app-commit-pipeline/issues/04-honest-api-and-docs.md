# 04: Honest API and docs

**What to build:** A Host App developer can trust the props and the README: every advertised prop works or is gone, and nothing is advertised that doesn't exist.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] title and description are shown by the wizard, or removed from the props
- [x] Accepted file types and maximum file size are enforced on upload with a clear error, or removed from the props
- [x] The upload step no longer claims HTML support in its help text, and its default copy is not placeholder text
- [x] TSV/TXT, encoding detection, visual confidence indicators and 'AI-powered' matching are removed from UI copy and docs (or actually implemented, with tests)
- [x] The PDF upload path is removed
- [x] There is a single README; the duplicate is removed
- [x] Tests cover any prop that is kept (e.g. an oversize file is refused with a message)
