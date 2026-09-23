# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Data Weaver** — a reusable React component library for CSV/Excel data import with a wizard flow: file upload → column mapping → review (validate, edit, exclude) → Commit through the Host App's adapter → Import Report. SpeakArt is the first Host App; the demo app (GitHub Pages) is an artwork data importer. Purpose, scope and vocabulary: `docs/product/`, `CONTEXT.md`, `docs/adr/`.

## Commands

```bash
npm run dev          # Start dev server on port 8080
npm run build        # Demo site build (GitHub Pages)
npm run build:lib    # Package build into dist-lib/ (vite.lib.config.ts); `npm pack` runs it
npm run lint         # ESLint (flat config, TS + React hooks + react-refresh)
npm test             # Run tests once (vitest run)
npm run test:watch   # Watch mode (vitest)
```

## Tech Stack

- **React 18** + **TypeScript** + **Vite** (SWC plugin)
- **Tailwind CSS** with CSS variables for theming (HSL-based color tokens in `src/index.css`)
- **shadcn/ui** (Radix primitives) — components in `src/components/ui/`, configured via `components.json`
- **TanStack React Query** for async state
- **React Router v6** for routing
- **SheetJS (xlsx)** for CSV/Excel parsing and export
- **Vitest** + **jsdom** + **@testing-library/react** for tests (setup in `src/test/setup.ts`)

## Architecture

### Two-layer library design

The import wizard is split into pure logic and React components, both barrel-exported:

- **`src/lib/import-wizard/`** — Pure TypeScript logic (no React). Four modules:
  - `parser.ts` — File parsing (CSV/Excel via SheetJS)
  - `matcher.ts` — Fuzzy column auto-matching using keyword similarity
  - `validator.ts` — Row validation with field-level and custom validators
  - `exporter.ts` — Export to CSV/Excel blobs
  - `messages.ts` — The message catalogue: English defaults (`DEFAULT_MESSAGES`), typed params, resolving a Host App's partial catalogue. Core messages carry a `messageRef` (key + params) so the UI can translate them
  - `types.ts` — All type definitions and the legacy `ArtworkRecord` defaults

- **`src/components/import-wizard/`** — React components consuming the logic layer:
  - `ImportWizard.tsx` — Main orchestrator (upload → mapping → review → commit → report); Commit calls the Host App's `adapter.saveBatch` (see ADR-0002)
  - `FileUploader.tsx` — Drag-and-drop with file validation
  - `ColumnMapper.tsx` — Visual mapping UI with auto-match confidence indicators
  - `DataValidator.tsx` — Data table with inline editing, search, find/replace, export
  - `EditableCell.tsx` — Single cell editor with keyboard navigation
  - `SearchBar.tsx` / `FindReplaceDialog.tsx` — Search and bulk replace
  - `AiEditChat.tsx` — AI Edit chat; calls the Host App-supplied `aiEdit` handler (hidden without one)
  - `WizardRoot.tsx` — `.dw-root` styling scope + TooltipProvider + portal container + message catalogue context; every step component wraps itself in one. Components read text with `useMessages()` (`messages.ts`): no hard-coded Importer-visible copy (enforced by `__tests__/Messages.test.tsx`)

### Generic type system with legacy compat

The library uses `FieldConfig<TKey>` for generic field definitions. Legacy `ArtworkRecord` / `TargetField` types and `ARTWORK_FIELD_CONFIGS` are preserved for backwards compatibility and used by the demo app.

### Key patterns

- **`useHistory` hook** (`src/hooks/useHistory.ts`) — Generic undo/redo with 50-level stack, used by DataValidator
- **Path alias**: `@/` maps to `src/` (configured in tsconfig and vite)
- **Theming**: Tailwind uses `hsl(var(--token))` pattern; the wizard's tokens and component classes live in `src/components/import-wizard/styles.css`, scoped to `.dw-root`
- **Package CSS**: `library.css` + `tailwind.lib.config.ts` compile utilities with `important: '.dw-root'` and no global preflight, so Host Apps need no Tailwind. Radix portals render into WizardRoot's container (`src/components/ui/portal-container.tsx`) so they stay styled
- **Dark mode**: Class-based (`darkMode: ["class"]` in tailwind config)

## Environment Variables

None. The library has no backend; AI Edit uses an endpoint the Host App supplies.

## Testing

Logic tests live in `src/lib/import-wizard/__tests__/`, component tests in `src/components/import-wizard/__tests__/` (Testing Library; the parser is mocked). Test environment is jsdom with `@testing-library/jest-dom` matchers.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
