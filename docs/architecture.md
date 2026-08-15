# Agency Studio — Architecture

Phase 03 (Discovery Engine) builds on Phase 02 (Command Center & Core
Operations), which built on the Phase 01 foundation. This document
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
    businesses.ts    #   Pipeline businesses: CRUD, setStage, convertToClient
    campaigns.ts     #   Outreach campaigns: CRUD + status + business counts
    discovery.ts     #   Discovery engine: runs, record import, website checks
    markets.ts       #   Market catalog: list + idempotent seed
    migrate.ts       #   Phase 1 leads -> businesses (idempotent, once)
    clients.ts       #   Clients CRUD + stats (detaches projects on delete)
    projects.ts      #   Website projects CRUD + stats
    activity.ts      #   Activity log queries
    providers.ts     #   Provider slots (reserved, NOT_CONFIGURED)
    system.ts        #   Health checks, boot meta, public status
  shared/
    domain.ts        # Statuses, labels, tones, market catalog, provider
                     # catalog — imported by BOTH Convex and the client
                     # (single source of truth)
    pipeline.ts      # Pipeline transition rules (canTransition,
                     # transitionError) used by businesses.setStage
    discovery/       # Discovery record pipeline: normalize, validate, dedupe,
                     # enrich (pure, shared with tests)
  lib/
    validation.ts    # Zod form schemas (incl. business + campaign)
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
    studio `AppShell` with nested routes: Command center (overview),
    Pipeline, Discovery, Campaigns, Markets, Websites, Clients, Activity,
    System health, Settings. `/dashboard/leads` redirects to the pipeline.
    Every nav link points at a real route.
- **App shell** (`components/studio/app-shell.tsx`): fixed sidebar rail on
  desktop, sheet drawer on mobile, sticky topbar, command palette (⌘K), and
  shell-owned "create" dialogs (business, campaign, client, project). Pages
  open those dialogs through the router `<Outlet context>` — no hand-rolled
  context tree. On mount the shell also runs `system.recordBoot` (seeds the
  market catalog) and the idempotent Phase 1 migration once.
- **Data fetching**: Convex `useQuery`/`useMutation`/`useAction` only.
  Queries are reactive subscriptions; mutations write; the UI updates itself.
  No client-side copies of server state.
- **States**: every data section handles loading (spinner), empty
  (EmptyState with a real next action), and error (ErrorState via a
  `QueryBoundary`; Convex throws query errors at the call site, so sections
  catch them locally instead of crashing the page).
- **Command palette**: only commands that work — navigating to real routes
  and the four real create actions.

## Command center

The overview page is a real command center: every number comes from
`businesses.stats`, `campaigns.stats`, `projects.stats`, and
`clients.stats`. Zeros are zeros. It includes a clickable per-stage
pipeline summary (deep-links into `/dashboard/pipeline?stage=…`), running
campaigns, recent activity, system status, and quick actions.

The pipeline page filters by stage/market with a debounced search over
company, contact, email, and website; changes stage inline (enforced by
`src/shared/pipeline.ts`); scores opportunities 0–100 (70+ = high
priority); and converts a business to a client (creates a real client row
and closes the record as WON). Campaigns target a market and region from
the seeded catalog, count attached businesses, and filter by market.

The Markets page (`markets.overview`) renders the catalog with real
per-market coverage — campaigns (including running), businesses, and
engaged opportunities — and deep-links into the pipeline and campaigns
via `?market=…` URL parameters, which those pages read on load.

## Discovery engine

Discovery is real execution with honest accounting, not placeholder data:

- **Runs** (`discovery.runsList` / `runsGet`): campaign-scoped executions
  with a status model (`QUEUED | RUNNING | COMPLETED | PARTIAL | FAILED |
  CANCELLED`), requested/processed counts, per-outcome counters, and
  terminal transitions guarded by `canRunTransition`.
- **Record pipeline** (`src/shared/discovery/`): pure functions shared
  between backend and tests — normalization (trim/lowercase, URL
  canonicalization), validation (required company, plausible email/website),
  deduplication (against existing businesses by normalized name, website,
  or email, with a signal label), and enrichment (confidence + source
  tagging). Every accepted record becomes a real pipeline business with
  provenance (`discoveryRunId`, `discoveredAt`, `source`, `confidence`).
- **CSV import** (`discovery.start` + `submitRecords`): batches are atomic
  and idempotent via client-supplied `batchId`s; the run advances honestly
  and syncs campaign status on completion.
- **Providers**: a working `csv-import` provider; every other provider slot
  stays `NOT_CONFIGURED` until something real is connected — no fake
  integrations.
- **Website checks** (`discovery.checkWebsite`, an action): fetches a
  business's URL with a bounded timeout and records the honest reachability
  outcome (`HAS_WEBSITE | NO_WEBSITE | UNREACHABLE | BLOCKED | INVALID_URL |
  CHECK_FAILED`) plus HTTP status.

All run/result mutations authenticate, validate, write atomically, record
activity entries, and log structured lines — same discipline as the other
entity modules.

## Backend architecture

- **Modules by entity**: each entity (businesses, campaigns, markets,
  clients, projects) owns its queries and mutations. All write paths:
  1. authenticate via `requireUser`
  2. validate (Convex argument validators + explicit domain checks,
     including market/region membership)
  3. enforce duplicate prevention where meaningful (email conflicts)
  4. write atomically, recording a real `activity` row
  5. log a structured line server-side
- **Pipeline rules** (`src/shared/pipeline.ts`): `WON`/`LOST` are
  absorbing; every other transition is allowed, and each `setStage` writes
  a `BUSINESS_STAGE_CHANGED` activity row. Nothing advances automatically.
- **Migration** (`src/convex/migrate.ts`): copies Phase 1 `leads` into
  `businesses` (stage mapped via `LEAD_STATUS_TO_STAGE`, source recorded as
  `PHASE1_MIGRATION`) exactly once per deployment, deduplicating by email.
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
- Tables: `businesses`, `campaigns`, `markets`, `discoveryRuns`,
  `discoveryResults`, `leads` (migration source only), `clients`,
  `projects`, `activity`, `providers`, `systemMeta`, plus the Convex Auth
  tables.
- Conventions: indexed lookups (`by_stage`, `by_market`, `by_email`,
  `by_campaign`, `by_status`, ...), timestamps via `_creationTime` plus
  explicit `updatedAt`, optional fields stored as `undefined` (never empty
  strings), foreign keys via `v.id(...)` with referential cleanup
  (deleting a client detaches its projects; deleting a campaign detaches
  its businesses).
- `markets` is configuration data seeded idempotently from `KNOWN_MARKETS`
  on boot — the same catalog the forms render.
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
  + lowercase, market/region membership, client and campaign existence
  for links, score 0–100).
- Client: Zod schemas in `src/lib/validation.ts` for inline field errors.
  Client validation is convenience; the server re-validates everything.

## Security baseline

- No secrets in client code; server env vars live in the Convex dashboard.
- Every data access is authenticated; every input is validated.
- Error payloads never expose stack traces, credentials, or internals.
- `.env.local`, `node_modules`, `dist`, and generated Convex files are
  gitignored; CI fails on lint/type errors.
- Rendering is plain React (no `dangerouslySetInnerHTML` anywhere).

## Boundaries (deliberately NOT in Phase 3)

The architecture leaves room for these without implementing them:

- External discovery providers (later phases) — only `csv-import` is real
  today; AI/scraping providers are reserved slots that stay
  `NOT_CONFIGURED` until real integrations exist. Businesses carry
  `source` + `confidence` provenance for when they do.
- Outreach (later phase) — campaigns are operator-driven records; no
  sending of any kind.
- Website Factory (later phase) — reachability checks are real; no
  generation/deployment.
- Repository Lab, Agency Director, payments — not modeled yet; sidebar
  shows these modules as "Soon".

The `providers` table, the `activity`/`systemMeta` patterns, the campaign
→ business link, and the market catalog are the intentional seams later
phases build on: provider adapters register their real status; long jobs
will be modeled as background work, not synchronous requests.
