# Agency Studio — Architecture

Phase 01 establishes a clean, production-grade foundation. This document
describes what actually exists. Future-phase systems are called out as
*boundaries*, not features.

## Stack decisions

| Layer        | Choice                                            | Why |
| ------------ | ------------------------------------------------- | --- |
| Frontend     | React 19 + TypeScript (strict) + Vite             | Fast, typed, platform template |
| Routing      | React Router v7 (`react-router`)                  | Nested protected routes + `returnTo` auth flow |
| UI           | shadcn/ui + Tailwind CSS v4 + lucide icons        | Consistent primitives, token-based theming |
| Animation    | Framer Motion (restrained, reduced-motion aware)  | Subtle motion on landing and shell |
| Backend      | Convex (queries / mutations / actions)            | Durable, reactive, server-side validated |
| Database     | Convex (durable, Postgres-backed)                 | Real storage with versioned schema |
| Auth         | Convex Auth (email OTP + anonymous guest)         | Real authentication, already wired |
| Validation   | Convex `v` validators (server) + Zod (client)     | Server validation is mandatory; client Zod drives form UX |
| Forms        | Controlled native forms + Zod parse               | No extra framework dependency |
| Testing      | Vitest (unit)                                     | Fast, zero-config for pure logic |
| Package mgmt | Bun                                               | Project standard |

## Repository structure

```
src/
  convex/            # Backend (Convex functions + schema)
    lib/             #   errors, logging, activity helpers
    leads.ts         #   Leads CRUD + stats
    clients.ts       #   Clients CRUD + stats (detaches projects on delete)
    projects.ts      #   Website projects CRUD + stats
    activity.ts      #   Activity log queries
    providers.ts     #   Provider slots (reserved, NOT_CONFIGURED)
    system.ts        #   Health checks, boot meta, public status
  shared/
    domain.ts        # Statuses, labels, tones, provider catalog — imported
                     # by BOTH Convex and the client (single source of truth)
  lib/
    validation.ts    # Zod form schemas
    errors.ts        # Safe client-side error extraction
    format.ts        # Relative time / date / initials
    config.ts        # Typed client env validation
  components/
    studio/          # App shell, sidebar, topbar, command palette, dialogs,
                     # states (empty/error/loading), status badge
    ui/              # shadcn/ui primitives (vendored, don't hand-edit)
  pages/
    Landing.tsx      # Public editorial landing
    Auth.tsx         # Sign-in (email OTP / guest)
    studio/          # Protected pages under /dashboard
  main.tsx           # Router + providers
docs/                # This documentation
.github/workflows/   # CI
```

## Frontend architecture

- **Route tree** (see `src/main.tsx`):
  - `/` landing; `/auth` sign-in; `/dashboard` protected shell.
  - `/dashboard` uses `RequireAuth` (preserves `returnTo`) and renders the
    studio `AppShell` with nested routes: Overview, Leads, Websites, Clients,
    Activity, System health, Settings. Every nav link points at a real route.
- **App shell** (`components/studio/app-shell.tsx`): fixed sidebar rail on
  desktop, sheet drawer on mobile, sticky topbar, command palette (⌘K), and
  shell-owned "create" dialogs. Pages open those dialogs through the router
  `<Outlet context>` — no hand-rolled context tree.
- **Data fetching**: Convex `useQuery`/`useMutation`/`useAction` only.
  Queries are reactive subscriptions; mutations write; the UI updates itself.
  No client-side copies of server state.
- **States**: every data section handles loading (spinner), empty
  (EmptyState with a real next action), and error (ErrorState via a
  `QueryBoundary`; Convex throws query errors at the call site, so sections
  catch them locally instead of crashing the page).
- **Command palette**: only commands that work — navigating to real routes
  and the three real create actions.

## Backend architecture

- **Modules by entity**: each entity (leads, clients, projects) owns its
  queries and mutations. All write paths:
  1. authenticate via `requireUser`
  2. validate (Convex argument validators + explicit domain checks)
  3. enforce duplicate prevention where meaningful (email conflicts)
  4. write atomically, recording a real `activity` row
  5. log a structured line server-side
- **Errors** (`src/convex/lib/errors.ts`): typed codes
  (`VALIDATION | UNAUTHENTICATED | NOT_FOUND | CONFLICT | DATABASE | INTERNAL`)
  thrown as `ConvexError` with a safe, user-displayable message. Full
  diagnostics go to logs, never to the client.
- **Logging** (`src/convex/lib/log.ts`): one JSON line per event
  (`level, event, at, ...details`). No secrets, no noisy per-read logs.
- **Activity**: append-only, written only by real operations. The dashboard
  and activity page render it directly.

## Database

- Schema lives in `src/convex/schema.ts`; pushed to the deployment via
  `bunx convex dev --once` (the project's migration mechanism). Schema
  changes are code-reviewed like any other change and applied to all
  environments the same way.
- Tables: `leads`, `clients`, `projects`, `activity`, `providers`,
  `systemMeta`, plus the Convex Auth tables.
- Conventions: indexed lookups (`by_status`, `by_email`, `by_client`,
  `by_type`, ...), timestamps via `_creationTime` plus explicit `updatedAt`,
  optional fields stored as `undefined` (never empty strings), foreign keys
  via `v.id(...)` with referential cleanup (deleting a client detaches its
  projects).
- `providers` holds reserved slots only — every row is `NOT_CONFIGURED`
  until a future phase connects something real.

## Health checks

`system.healthCheck` (action) performs real checks and returns an honest
report:

- **Database**: runs an actual query; `HEALTHY` only if it succeeds, with
  measured latency. Otherwise `ERROR` with a safe message.
- **Application**: the check itself executing.
- **Authentication**: the methods configured in `src/convex/auth.ts`.
- **Integrations**: exact provider-table state.
- **Status model**: `HEALTHY | DEGRADED | ERROR | NOT_CONFIGURED`
  (shared in `src/shared/domain.ts`).

The landing page shows `system.publicStatus` (db reachable + configured
count). The topbar chip reflects `system.dbPing` live. Nothing claims
"healthy" without verification.

## Validation

- Server: Convex `v` validators on every query/mutation argument plus
  explicit domain rules (required names, length caps, email normalization
  + lowercase, client existence for project links).
- Client: Zod schemas in `src/lib/validation.ts` for inline field errors.
  Client validation is convenience; the server re-validates everything.

## Security baseline

- No secrets in client code; server env vars live in the Convex dashboard.
- Every data access is authenticated; every input is validated.
- Error payloads never expose stack traces, credentials, or internals.
- `.env.local`, `node_modules`, `dist`, and generated Convex files are
  gitignored; CI fails on lint/type errors.
- Rendering is plain React (no `dangerouslySetInnerHTML` anywhere).

## Boundaries (deliberately NOT in Phase 1)

The architecture leaves room for these without implementing them:

- Repository Lab (Phase 4) — capability registry/assessment slots are not
  modeled; sidebar shows the module as "Soon".
- Agency Director (Phase 5) — no agent loop, no orchestration.
- Discovery/scraping (Phase 6+) — no scraping code.
- Website Factory (Phase 8) — no generation/deployment.
- Outreach (Phase 10) and payments (Phase 11) — no sending, no payouts.

The `providers` table and the `activity`/`systemMeta` patterns are the
intentional seams later phases build on: provider adapters register their
real status; long jobs will be modeled as background work, not synchronous
requests.
