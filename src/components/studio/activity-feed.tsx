import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { History } from "lucide-react";
import type { ActivityType } from "@/shared/domain";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import { EmptyState, LoadingState } from "./states";

/**
 * Real activity feed: rows come from the `activity` table, which is written
 * only by actual operations. Never fabricated.
 */
export function ActivityFeed({
  type,
  limit = 8,
  className,
}: {
  type?: ActivityType;
  limit?: number;
  className?: string;
}) {
  const activity = useQuery(api.activity.list, {
    ...(type ? { type } : {}),
    limit,
  });

  if (activity === undefined) {
    return <LoadingState label="Loading activity…" className="py-10" />;
  }

  if (activity.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={type ? "No events of this type" : "No activity yet"}
        description={
          type
            ? "Events of this kind will appear here when they happen."
            : "Real operations — creating businesses, campaigns, clients, and projects — will appear here."
        }
        className="py-10"
      />
    );
  }

  return (
    <ol className={cn("divide-y divide-border", className)}>
      {activity.map((item) => (
        <li key={item._id} className="flex gap-3 py-3">
          <span
            className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-5 text-foreground">
              {item.description}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.actorName ?? item.actorEmail ?? "Studio"} ·{" "}
              {formatRelativeTime(item._creationTime)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
