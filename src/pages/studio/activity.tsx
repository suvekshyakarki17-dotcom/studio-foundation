import { useState } from "react";
import { ActivityFeed } from "@/components/studio/activity-feed";
import { PageHeader } from "@/components/studio/page-header";
import { QueryBoundary } from "@/components/studio/query-boundary";
import { ErrorState } from "@/components/studio/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  type ActivityType,
} from "@/shared/domain";

const ALL = "ALL";

function ActivityContent() {
  const [typeFilter, setTypeFilter] = useState<ActivityType | typeof ALL>(ALL);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Activity"
        description="A chronological log of real operations. Nothing here is fabricated — every entry was written by an actual create, update, or delete."
      >
        <Select
          value={typeFilter}
          onValueChange={(value) =>
            setTypeFilter(value as ActivityType | typeof ALL)
          }
        >
          <SelectTrigger
            size="sm"
            aria-label="Filter by event type"
            className="min-w-[180px]"
          >
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All events</SelectItem>
            {ACTIVITY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {ACTIVITY_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      <section
        aria-label="Activity log"
        className="rounded-md border border-border bg-card"
      >
        <div className="border-b border-border px-5 py-4">
          <p className="text-sm text-muted-foreground">Recent events</p>
        </div>
        <div className="px-5 py-2">
          {typeFilter === ALL ? (
            <ActivityFeed limit={100} />
          ) : (
            <ActivityFeed type={typeFilter} limit={100} />
          )}
        </div>
      </section>
    </div>
  );
}

export default function ActivityPage() {
  return (
    <QueryBoundary
      fallback={(retry) => (
        <ErrorState
          title="Unable to load activity"
          description="The database may be unreachable. Check System health, then retry."
          onRetry={retry}
          className="py-24"
        />
      )}
    >
      <ActivityContent />
    </QueryBoundary>
  );
}
