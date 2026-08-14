import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { StudioMark } from "@/components/studio/studio-mark";
import { Button } from "@/components/ui/button";
import { useQuery } from "convex/react";
import {
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { ArrowRight, Contact, Database, Globe, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { APP_NAME, APP_VERSION } from "@/shared/domain";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export default function Landing() {
  const reduceMotion = useReducedMotion();
  const { isAuthenticated } = useAuth();
  const studioHref = isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fdashboard";

  const motionProps = reduceMotion
    ? { initial: false, animate: "visible" as const }
    : { initial: "hidden" as const, animate: "visible" as const };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <StudioMark className="size-7" />
            <span className="font-display text-lg tracking-tight">
              {APP_NAME}
            </span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Primary">
            <a
              href="#foundation"
              className="hidden rounded-sm px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Foundation
            </a>
            <a
              href="#scope"
              className="hidden rounded-sm px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Scope
            </a>
            <Link to="/auth">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link to={studioHref}>
              <Button size="sm">
                {isAuthenticated ? "Open studio" : "Enter studio"}
                <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="border-b border-border">
          <motion.div
            {...motionProps}
            variants={fadeUp}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28"
          >
            <p className="mx-auto w-fit rounded-sm border border-border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {APP_NAME} — Phase 01 · Foundation
            </p>
            <h1 className="mx-auto mt-8 max-w-3xl font-display text-4xl leading-[1.1] tracking-tight text-balance sm:text-6xl">
              A private operating system for a modern web agency.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              One operator, one command center. {APP_NAME} is built to run a
              web agency alone — starting with a real, verifiable foundation
              that later phases extend without a rewrite.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link to={studioHref}>
                <Button size="lg">
                  Enter the studio
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <a href="#foundation">
                <Button variant="outline" size="lg">
                  Read the architecture
                </Button>
              </a>
            </div>

            <div className="mt-12 flex justify-center">
              <LiveStatusStrip />
            </div>
          </motion.div>
        </section>

        {/* The system */}
        <section className="border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <motion.div
              {...motionProps}
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className="mb-10"
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                The system
              </p>
              <h2 className="mt-3 max-w-xl font-display text-3xl tracking-tight text-balance">
                Built like a serious product, not a demo.
              </h2>
            </motion.div>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
              <Panel
                index="01"
                title="Command center"
                icon={Globe}
                body="A precise application shell — sidebar, command palette, real navigation — with leads, websites, and clients managed against a real database."
              />
              <Panel
                index="02"
                title="Real data"
                icon={Database}
                body="Every metric on the dashboard is derived from the database. Zero leads means zero leads. No fabricated numbers, no pretend integrations."
              />
              <Panel
                index="03"
                title="Honest status"
                icon={ShieldCheck}
                body="Health checks report only what they verified. The database is healthy only if a real query succeeded; providers stay not-configured until actually connected."
              />
            </div>
          </div>
        </section>

        {/* Foundation */}
        <section id="foundation" className="scroll-mt-20 border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <motion.div
              {...motionProps}
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-1 gap-12 lg:grid-cols-2"
            >
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Phase 01
                </p>
                <h2 className="mt-3 font-display text-3xl tracking-tight text-balance">
                  What exists today
                </h2>
                <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                  The foundation is real and verified: authentication, a
                  durable database with migrations, strict types, health
                  checks, CRUD, and an activity log.
                </p>
                <ul className="mt-8 space-y-0 border-t border-border">
                  {FOUNDATION_ITEMS.map((item, index) => (
                    <li
                      key={item}
                      className="flex gap-4 border-b border-border py-3 text-sm text-foreground"
                    >
                      <span className="font-display text-sm text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div id="scope" className="scroll-mt-20">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Scope
                </p>
                <h2 className="mt-3 font-display text-3xl tracking-tight text-balance">
                  Deliberately not built yet
                </h2>
                <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                  Later phases add these systems on top of this foundation.
                  Phase 1 never pretends they exist.
                </p>
                <ul className="mt-8 space-y-0 border-t border-border">
                  {SCOPE_ITEMS.map((item, index) => (
                    <li
                      key={item.name}
                      className="flex items-center justify-between gap-4 border-b border-border py-3"
                    >
                      <span className="text-sm text-muted-foreground">
                        <span className="mr-3 font-display text-sm text-muted-foreground/60">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {item.name}
                      </span>
                      <span className="rounded-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                        {item.phase}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section>
          <div className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-24">
            <motion.div
              {...motionProps}
              variants={fadeUp}
              transition={{ duration: 0.5 }}
            >
              <h2 className="mx-auto max-w-xl font-display text-3xl tracking-tight text-balance">
                Start with a foundation you can trust.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                Sign in to open the studio and work with real data from the
                first minute.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link to={studioHref}>
                  <Button size="lg">
                    {isAuthenticated ? "Open studio" : "Enter the studio"}
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button variant="outline" size="lg">
                    Sign in
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>
            {APP_NAME} — Phase 01 · Foundation · v{APP_VERSION}
          </p>
          <p className="flex items-center gap-2">
            <Contact className="size-3.5" />
            Private workspace · Built on Convex
          </p>
        </div>
      </footer>
    </div>
  );
}

function Panel({
  index,
  title,
  body,
  icon: Icon,
}: {
  index: string;
  title: string;
  body: string;
  icon: typeof Globe;
}) {
  return (
    <div className="flex flex-col gap-4 bg-card p-6">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm text-muted-foreground">
          {index}
        </span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div>
        <h3 className="font-display text-xl tracking-tight text-foreground">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function LiveStatusStrip() {
  const status = useQuery(api.system.publicStatus);
  const dot = status === undefined ? "bg-amber-500 animate-pulse" : status.dbOk ? "bg-emerald-600" : "bg-red-600";
  const label =
    status === undefined
      ? "Checking live status…"
      : status.dbOk
        ? `Database connected · ${status.providersConfigured} integrations configured`
        : "Database unreachable";

  return (
    <p className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" />
      {label}
    </p>
  );
}

const FOUNDATION_ITEMS = [
  "Application shell with real navigation, command palette, and responsive layout",
  "Real authentication — email OTP and guest sign-in",
  "Durable Convex database with a versioned schema and migrations",
  "Health checks that verify the database before calling anything healthy",
  "Leads, websites, and clients with full create, edit, and delete flows",
  "An activity log written only by real operations",
  "Strict TypeScript, validated inputs, and structured server logging",
];

const SCOPE_ITEMS = [
  { name: "Repository Lab", phase: "Phase 4" },
  { name: "Agency Director", phase: "Phase 5" },
  { name: "Business discovery & scraping", phase: "Phase 6" },
  { name: "Website Factory", phase: "Phase 8" },
  { name: "Automated outreach", phase: "Phase 10" },
  { name: "Payments", phase: "Phase 11" },
];
