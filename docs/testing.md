# Agency Studio — Testing

## Strategy

Phase 1 ships real unit tests for the pure, deterministic layers that are
cheap and safe to test without a running deployment:

- **`src/lib/validation.ts`** — Zod form schemas: valid/invalid inputs,
  email normalization, empty-field handling, length caps, edit-schema
  status enums.
- **`src/lib/format.ts`** — relative-time boundaries, date formatting,
  initials.
- **`src/lib/errors.ts`** — safe error-message extraction from Convex
  errors, plain errors, and unknown values (no leakage).

Convex queries/mutations/actions are not unit-tested in isolation because
they execute against the deployment; the platform continuously validates
them by pushing (`bunx convex dev --once`) and typechecking every turn, and
the app exercises them end-to-end through the UI (see the manual/QA flow
below). API-route-level tests belong to a future phase when a local Convex
test runner is adopted.

## Running

```bash
bun run test        # once
bun run test:watch  # watch mode
```

## What must be true

- `bun run lint` exits 0.
- `bun run typecheck` exits 0 (strict).
- `bun run test` exits 0.
- `bun run build` succeeds.
- CI runs all of the above (see `.github/workflows/ci.yml`).

## Manual QA flow (per release)

1. Landing renders, live status strip shows the real database state, CTAs
   go to `/auth` (and `/dashboard` when signed in).
2. Sign in with email OTP or guest → lands on `/dashboard` Overview.
3. Overview shows real zeros/empty states on a fresh database.
4. Create a lead, client, and project → they appear in lists, metrics, and
   the activity log; toasts confirm; the database row exists.
5. Edit a record and change its status → activity records the change.
6. Delete a client → its projects remain, unlinked.
7. ⌘K opens the command palette; navigation and create actions work.
8. `/dashboard/system` runs a real health check: database latency is
   measured, provider slots read `NOT_CONFIGURED`, status reflects the
   check.
9. Viewports: desktop, tablet, mobile — no horizontal overflow, tables
   switch to cards, the sidebar becomes a drawer.
10. Keyboard: focus rings visible, dialogs trap focus, Escape closes
    overlays.
