import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { QueryBoundary } from "./query-boundary";

function ChipState({
  tone,
  label,
  title,
}: {
  tone: "ok" | "warn" | "error";
  label: string;
  title: string;
}) {
  return (
    <Link
      to="/dashboard/system"
      title={title}
      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "ok" && "bg-emerald-600",
          tone === "warn" && "animate-pulse bg-amber-500",
          tone === "error" && "bg-red-600",
        )}
        aria-hidden="true"
      />
      {label}
    </Link>
  );
}

function ChipInner() {
  // A real database read — green only when the query actually succeeds.
  const db = useQuery(api.system.dbPing);
  if (db === undefined) {
    return <ChipState tone="warn" label="Checking system…" title="Checking database connectivity" />;
  }
  return <ChipState tone="ok" label="System healthy" title="Database connected — see System health" />;
}

export function SystemStatusChip() {
  return (
    <QueryBoundary fallback={() => <ChipState tone="error" label="System unreachable" title="Database could not be reached — see System health" />}>
      <ChipInner />
    </QueryBoundary>
  );
}
