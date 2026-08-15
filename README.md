# Agency Studio

A private, AI-first operating system for running a modern web agency alone —
built on **Phase 01: Foundation** and now at **Phase 02: Command Center & Core
Operations**.

Phase 2 turns the foundation into a genuinely usable agency operations
command center: a real pipeline of businesses moving from discovery to won
engagements, campaigns targeting markets and regions, client conversion,
search and filtering, and an overview driven entirely by live database
state. Phase 1's leads are migrated into the pipeline automatically (once,
idempotently) on first boot.

Everything is real and verified, not a mockup: authentication, a durable
database with a versioned schema, strict types, health checks that only
report what they verified, and an honest UI. Future systems (Repository
Lab, Agency Director, Website Factory, outreach, payments, …) are
deliberately **not** built yet; the architecture reserves clean seams for
them (see `docs/architecture.md`).

> **Honesty rule**: nothing here is fabricated. Dashboard metrics come from
> real database state, health checks run real queries, provider slots stay
> `NOT_CONFIGURED` until something real is connected.

## Tech stack

- **Frontend**: React 19, TypeScript (strict), Vite, Tailwind CSS v4,
  shadcn/ui, Framer Motion, lucide icons, React Router v7
- **Backend & database**: Convex (durable, Postgres-backed; queries,
  mutations, actions)
- **Auth**: Convex Auth — email OTP + anonymous guest
- **Validation**: Convex `v` validators server-side; Zod client-side
- **Testing**: Vitest · **Package manager**: Bun

## What Phase 2 includes

- **Command center** overview: pipeline, opportunities, campaigns, and
  projects metrics — all derived from the database (zeros are zeros)
- **Pipeline**: businesses with a 10-stage pipeline (discovered → won /
  lost), operator-set priority scores (0–100), website-state assessment,
  market/region tagging, campaign links, and search + stage/market filters
- **Stage transitions** enforced by shared rules (`src/shared/pipeline.ts`),
  each change written to the activity log
- **Convert to client**: closes a business as won and creates a real linked
  client record
- **Campaigns**: market/region-targeted outreach records with status,
  keywords, and attached-business counts
- **Market catalog**: seeded idempotently from `KNOWN_MARKETS` (US, CA, GB,
  NP with full region lists), used by campaign and business forms
- **Phase 1 → Phase 2 migration**: `leads` are imported into the pipeline
  once (idempotent, email-deduplicated), then the legacy table is unused
- Real CRUD for **Websites (projects)** and **Clients** with server-side
  validation, duplicate prevention, and an **activity log** written only by
  real operations
- **System health**: application, database (real ping with latency),
  authentication, and provider slots — honest states only
- Studio shell: sidebar, topbar, command palette (⌘K), mobile drawer,
  responsive tables/cards
- Strict TypeScript, typed errors, structured logging, request-safe
  messages, no secrets in the client
- 27 unit tests, lint, typecheck, production build, and CI
- Documentation: `docs/architecture.md`, `docs/development.md`,
  `docs/environment.md`, `docs/testing.md`

## Getting started

```bash
bun install
bun run dev          # dev server (platform-managed in Freebuff)
bunx convex dev --once   # push schema + regenerate _generated types
```

## Scripts

| Script                  | Purpose                              |
| ----------------------- | ------------------------------------ |
| `bun run dev`           | Vite dev server                      |
| `bun run build`         | Production build                     |
| `bun run preview`       | Preview the production build         |
| `bun run lint`          | ESLint                               |
| `bun run typecheck`     | `tsc -b --noEmit`                    |
| `bun run test`          | Vitest unit tests                    |
| `bun run test:watch`    | Vitest watch                         |
| `bun run codegen`       | Regenerate Convex types              |

## Repository layout

```
src/
  convex/        Backend: schema, entity modules, migration, health checks
  shared/        Domain model + pipeline transition rules (backend & client)
  lib/           Client validation, errors, formatting, env config
  components/
    studio/      App shell, sidebar, topbar, command palette, dialogs, states
    ui/          shadcn/ui primitives (vendored — don't hand-edit)
  pages/         Landing, Auth, and the protected /dashboard pages
docs/            Architecture, development, environment, testing
.github/         CI workflow
```

## Environment

Client env: `VITE_CONVEX_URL` (see `.env.example`). Server secrets live in
the Convex dashboard, never in the repo. Details in `docs/environment.md`.

## Auth & protected routes

The `/auth` page handles email-OTP and guest sign-in. `/dashboard` is
protected by `RequireAuth`, which preserves the requested path via
`?returnTo=...`. All studio routes live under `/dashboard` (`pipeline`,
`campaigns`, `websites`, `clients`, `activity`, `system`, `settings`).
The legacy `/dashboard/leads` path redirects to the pipeline.

## License / notes

Private project. Auth and platform integration files are managed by the
Freebuff platform — do not edit `src/convex/auth.ts`,
`src/convex/auth.config.ts`, `src/convex/auth/emailOtp.ts`,
`src/convex/users.ts`, `vite.config.ts`, or `vly-toolbar-readonly.tsx`.
