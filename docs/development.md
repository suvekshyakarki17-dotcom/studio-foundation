# Agency Studio — Development

## Prerequisites

- Bun (package manager and script runner).
- A Convex deployment (in the Freebuff environment this is provisioned
  automatically; locally, run `bunx convex dev` once to create one).

## Commands

| Command                    | Purpose                                        |
| -------------------------- | ---------------------------------------------- |
| `bun install`              | Install dependencies                           |
| `bun run dev`              | Start the Vite dev server                      |
| `bun run typecheck`        | `tsc -b --noEmit` (strict)                     |
| `bun run lint`             | ESLint (react-hooks + typescript-eslint)       |
| `bun run test`             | Vitest unit tests (once)                       |
| `bun run test:watch`       | Vitest watch                                   |
| `bun run build`            | Production build (`tsc -b && vite build`)      |
| `bunx convex dev --once`   | Push schema/functions + regenerate `_generated` |
| `bunx convex codegen`      | Regenerate `_generated` without pushing        |

In the Freebuff environment the platform runs the dev server and Convex
process for you; you don't start or restart them.

## Conventions

- **Imports**: `@/` aliases for `src/` (e.g. `@/convex/_generated/server`,
  `@/components/ui/button`). Within `src/convex`, use relative imports for
  non-convex modules (`../shared/domain`).
- **Do not edit**: `src/convex/auth.ts`, `src/convex/auth.config.ts`,
  `src/convex/auth/emailOtp.ts`, `src/convex/users.ts`, `vite.config.ts`,
  `vly-toolbar-readonly.tsx`, `src/convex/_generated/*` (regenerate instead),
  or vendored `src/components/ui/*` (shadcn primitives).
- **Types**: strict TypeScript, `erasableSyntaxOnly` (no enums — use
  `as const` + unions from `src/shared/domain.ts`). No `any`, no
  `@ts-ignore`. Branded IDs (`Id<"leads">`) come from
  `@/convex/_generated/dataModel`.
- **Statuses/labels**: define once in `src/shared/domain.ts`; Convex and
  the client both import from there. Never hardcode a status string in UI.
- **Write paths**: require the user (`requireUser`), validate, write,
  record activity, log. See `src/convex/leads.ts` as the reference.
- **Forms**: controlled native forms + Zod parse on submit; show the first
  Zod issue inline and toast mutation errors via `getErrorMessage`.

## Data flow (example: create a lead)

1. Overview/Leads page opens `LeadFormDialog` (shell-owned for create,
   page-owned for edit).
2. Submit parses `leadFormSchema`; invalid → inline error.
3. `leads.create` mutation validates server-side, normalizes (trim,
   lowercase email), rejects duplicates, inserts, writes an activity row,
   logs.
4. The reactive `leads.list` / `leads.stats` queries update the UI; the
   toast confirms.

## Adding a page

1. Create `src/pages/studio/<name>.tsx` with a default export wrapped in
   `QueryBoundary` (for query errors) with loading/empty/error states.
2. Add the lazy route under `/dashboard` in `src/main.tsx`.
3. Add the nav item + page meta in `src/components/studio/nav.ts`.
4. If the page needs the shell's create dialogs, read them from
   `useOutletContext<StudioOutletContext>()`.

## Honesty rules

- Never fabricate data, statuses, or integrations.
- Metrics must come from real queries.
- Provider rows stay `NOT_CONFIGURED` until something real is connected.
- Health states must reflect actual checks.
