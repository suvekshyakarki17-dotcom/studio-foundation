import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: number | string;
  sub?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-5",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
