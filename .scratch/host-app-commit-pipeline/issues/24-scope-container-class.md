# 24: Scope the `.container` rules to `.dw-root`

**What to build:** Every rule in `dist-lib/styles.css` applies only inside `.dw-root`, so embedding Data Weaver never restyles the Host App. Today two rules escape the scope: `.container{width:100%;margin:auto;padding:0 2rem}` with `max-width:1400px` at `2xl`, and `.!container`. Found on 2026-09-29 while embedding Data Weaver in SpeakArt (harmless there: SpeakArt uses no `container` class, but another Host App on Tailwind would get its `.container` overridden).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `.container` and `.!container` are emitted under `.dw-root` (or the unused `container` utility is dropped from the library build)
- [ ] A test (or build check) fails when `styles.css` has a selector outside `.dw-root`, keyframes and `@`-rules aside
