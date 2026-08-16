# Agency Studio — Environment

Two environments exist: the **client bundle** (Vite `import.meta.env`) and
the **Convex server** (deployment environment variables). Secrets belong
only in the Convex dashboard — never in `.env` files or committed code.

## Client variables (`VITE_*`)

| Variable          | Required | Purpose                                  |
| ----------------- | -------- | ---------------------------------------- |
| `VITE_CONVEX_URL` | yes      | Convex deployment URL for the client SDK |

- In the Freebuff environment the platform injects `VITE_CONVEX_URL`.
- For local development, copy `.env.example` to `.env.local` and fill it in.
- `src/lib/config.ts` validates the client env with Zod at startup and logs
  a clear message if a required variable is missing. The rest of the app
  reads config through `clientEnv`, never raw `import.meta.env`.

## Server variables (Convex dashboard)

Set these in the Convex dashboard (the `.env.local` / `.env.example` files
must NOT contain them):

| Variable               | Purpose                                          |
| ---------------------- | ------------------------------------------------ |
| `CONVEX_SITE_URL`      | Site URL used by Convex Auth to issue JWTs       |
| `JWT_PRIVATE_KEY` / `JWKS` | Auth token signing (Convex Auth)             |
| `VLY_APP_NAME`         | App name used in OTP emails                      |
| `VLY_INTEGRATION_KEY`  | Platform integration key (server only)           |
| `SGAI_API_KEY`         | ScrapeGraphAI API key (Phase 3 discovery)        |

`SGAI_API_KEY` is read only inside the Node-runtime action
(`src/convex/scrapegraphai.ts`) via `process.env.SGAI_API_KEY` — it never
reaches the client bundle or the logs. The discovery page shows the
provider as configured/unconfigured based on its real presence on the
server (`scrapegraphai.providerStatus`), never on a client-side claim.

Future provider credentials (AI, email, payments, deployment, ...) will be
added here when the corresponding phase wires a real integration. Phase 1
requires none of them — see the provider slots in `src/shared/domain.ts`.

## Deployment

- `bunx convex dev --once` pushes the schema + functions to the linked
  deployment (this is how schema "migrations" are applied).
- CI runs `bunx convex codegen --typecheck disable` to regenerate
  `src/convex/_generated` from the schema without needing a deployment.
