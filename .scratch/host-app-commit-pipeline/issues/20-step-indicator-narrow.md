# 20: Step indicator fits narrow containers

**What to build:** An Importer using the wizard in a narrow space, such as a phone or a Host App's drawer, sees a step indicator that fits without widening the page. With five steps, the full indicator needs about 880 px, so it overflowed on phones and in the demo's 736 px wizard column.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `../spec.md`

- [x] When the full indicator doesn't fit its container, lines and gaps shrink and only the current step keeps a visible label; the others stay for screen readers. It returns to full when there's room again.
- [x] The switch is based on the container, not the viewport, and is measured rather than a fixed breakpoint, so translated labels of any length work.
- [x] In a very narrow container, even the compact row scrolls rather than widening the page.
- [x] A test fakes container widths and checks that the indicator switches both ways.

## Notes

Measured in Chromium on the demo:
- At 390 px viewport (324 px container): compact, no overflow.
- At 1280 px viewport (736 px column): compact, no overflow.
- With the container at 896 px: full labels, no overflow.
- Back to 736 px: compact again, with no flip-flopping.
- At 247 px: the compact row scrolls inside its container instead of widening the page.
