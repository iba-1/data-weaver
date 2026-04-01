# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**React Import Wizard** — a reusable React component library for CSV/Excel data import with a 3-step wizard flow: file upload → column mapping → data validation/editing. The demo app is an artwork data importer. Originally scaffolded with Lovable.

## Commands

```bash
npm run dev          # Start dev server on port 8080
npm run build        # Production build
npm run lint         # ESLint (flat config, TS + React hooks + react-refresh)
npm test             # Run tests once (vitest run)
npm run test:watch   # Watch mode (vitest)
```

## Tech Stack

- **React 18** + **TypeScript** + **Vite** (SWC plugin)
- **Tailwind CSS** with CSS variables for theming (HSL-based color tokens in `src/index.css`)
- **shadcn/ui** (Radix primitives) — components in `src/components/ui/`, configured via `components.json`
- **Supabase** — client at `src/integrations/supabase/client.ts`, edge function `ai-edit-rows` for AI-powered bulk edits
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
  - `types.ts` — All type definitions and the legacy `ArtworkRecord` defaults

- **`src/components/import-wizard/`** — React components consuming the logic layer:
  - `ImportWizard.tsx` — Main orchestrator (3-step state machine: upload → mapping → validation)
  - `FileUploader.tsx` — Drag-and-drop with file validation
  - `ColumnMapper.tsx` — Visual mapping UI with auto-match confidence indicators
  - `DataValidator.tsx` — Data table with inline editing, search, find/replace, export
  - `EditableCell.tsx` — Single cell editor with keyboard navigation
  - `SearchBar.tsx` / `FindReplaceDialog.tsx` — Search and bulk replace
  - `AiEditChat.tsx` — AI-powered inline chat (calls Supabase edge function `ai-edit-rows`)

### Generic type system with legacy compat

The library uses `FieldConfig<TKey>` for generic field definitions. Legacy `ArtworkRecord` / `TargetField` types and `ARTWORK_FIELD_CONFIGS` are preserved for backwards compatibility and used by the demo app.

### Key patterns

- **`useHistory` hook** (`src/hooks/useHistory.ts`) — Generic undo/redo with 50-level stack, used by DataValidator
- **Path alias**: `@/` maps to `src/` (configured in tsconfig and vite)
- **Theming**: Tailwind uses `hsl(var(--token))` pattern; custom wizard tokens (dropzone, validation, mapping colors) defined in `src/index.css`
- **Dark mode**: Class-based (`darkMode: ["class"]` in tailwind config)

## Environment Variables

Required in `.env`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Testing

Tests live alongside source in `src/lib/import-wizard/__tests__/`. Four test files cover the core logic modules (parser, matcher, validator, exporter). Test environment is jsdom with `@testing-library/jest-dom` matchers.
