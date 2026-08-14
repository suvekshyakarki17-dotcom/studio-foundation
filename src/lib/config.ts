/**
 * Typed client configuration.
 *
 * Vite only exposes `import.meta.env.*` variables that are prefixed with
 * VITE_. Server-side secrets live in the Convex deployment and are never
 * referenced here. See docs/environment.md.
 */
import { z } from "zod";

const clientEnvSchema = z.object({
  VITE_CONVEX_URL: z
    .string()
    .min(1, "VITE_CONVEX_URL must be set (see .env.example / docs/environment.md)."),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

function loadClientEnv(): ClientEnv {
  const parsed = clientEnvSchema.safeParse({
    VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
  });
  if (!parsed.success) {
    // Fail loudly in the console but keep the app renderable so the
    // platform's injected env simply works.
    console.error(
      `[config] ${parsed.error.issues.map((issue) => issue.message).join(" ")}`,
    );
    return { VITE_CONVEX_URL: "" };
  }
  return parsed.data;
}

export const clientEnv = loadClientEnv();
