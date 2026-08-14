import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/studio/page-header";
import { ErrorState, LoadingState } from "@/components/studio/states";
import { StatusBadge } from "@/components/studio/status-badge";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import {
  HEALTH_STATUS_LABELS,
  HEALTH_STATUS_TONES,
  PROVIDER_STATUS_LABELS,
  PROVIDER_STATUS_TONES,
  type HealthCheckReport,
} from "@/shared/domain";

function SystemHealthContent() {
  const runHealthCheck = useAction(api.system.healthCheck);
  const [report, setReport] = useState<HealthCheckReport | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Run the real check when the page mounts and whenever the user asks to
  // re-run. State updates happen only in async continuations.
  useEffect(() => {
    let cancelled = false;
    runHealthCheck()
      .then((result) => {
        if (!cancelled) {
          setReport(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runHealthCheck, attempt]);

  const rerun = () => {
    setError(null);
    setChecking(true);
    setAttempt((value) => value + 1);
  };

  if (error && !report) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="System health"
          description="Live status of the application, database, and integrations."
        />
        <ErrorState
          title="Health check failed"
          description={error}
          onRetry={rerun}
          className="py-24"
        />
      </div>
    );
  }

  if (report === null) {
    return (
      <LoadingState
        label="Running real checks against the deployment…"
        className="py-24"
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="System health"
        description="Every status below comes from a check that actually ran. Nothing is reported healthy unless it verified itself."
      >
        <Button
          type="button"
          variant="outline"
          onClick={rerun}
          disabled={checking}
        >
          <RefreshCw className={`size-4 ${checking ? "animate-spin" : ""}`} />
          Run check
        </Button>
      </PageHeader>

      <section
        aria-label="Overall status"
        className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-card p-6"
      >
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Overall
          </p>
          <p className="mt-1 font-display text-2xl tracking-tight text-foreground">
            {checking ? "Checking…" : HEALTH_STATUS_LABELS[report.status]}
          </p>
        </div>
        <StatusBadge
          label={HEALTH_STATUS_LABELS[report.status]}
          tone={HEALTH_STATUS_TONES[report.status]}
        />
        <p className="w-full text-xs text-muted-foreground sm:w-auto">
          Last checked {formatDateTime(report.checkedAt)}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CheckCard title="Application">
          <Row label="Name" value={report.application.name} />
          <Row label="Version" value={`v${report.application.version}`} />
          <Row
            label="Status"
            value={
              <StatusBadge
                label={HEALTH_STATUS_LABELS[report.application.status]}
                tone={HEALTH_STATUS_TONES[report.application.status]}
              />
            }
          />
        </CheckCard>

        <CheckCard title="Database">
          <Row
            label="Status"
            value={
              <StatusBadge
                label={HEALTH_STATUS_LABELS[report.database.status]}
                tone={HEALTH_STATUS_TONES[report.database.status]}
              />
            }
          />
          <Row
            label="Latency"
            value={
              report.database.latencyMs !== undefined
                ? `${report.database.latencyMs}ms`
                : "—"
            }
          />
          <Row
            label="Checked at"
            value={formatDateTime(report.database.checkedAt)}
          />
          {report.database.error && (
            <p className="text-sm text-destructive">{report.database.error}</p>
          )}
        </CheckCard>

        <CheckCard title="Authentication">
          {report.auth.methods.map((method) => (
            <Row key={method.id} label={method.id} value="Configured" />
          ))}
        </CheckCard>

        <CheckCard
          title="Integrations"
          description="Provider slots reserved for later phases. None are connected in Phase 1 — this list is honest about that."
        >
          {report.providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No provider slots recorded yet.
            </p>
          ) : (
            report.providers.map((provider) => (
              <div
                key={provider.type}
                className="flex items-start justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {provider.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {provider.capabilities.join(" · ")}
                  </p>
                </div>
                <StatusBadge
                  label={PROVIDER_STATUS_LABELS[provider.status]}
                  tone={PROVIDER_STATUS_TONES[provider.status]}
                />
              </div>
            ))
          )}
        </CheckCard>
      </div>

      {report.system.firstSeenAt && (
        <section
          aria-label="System metadata"
          className="rounded-md border border-border bg-card"
        >
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-display text-lg tracking-tight text-foreground">
              System
            </h2>
          </div>
          <div className="px-5 py-4">
            <Row
              label="First boot recorded"
              value={formatDateTime(report.system.firstSeenAt)}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function CheckCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-display text-lg tracking-tight text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <dl className="space-y-3 px-5 py-4">{children}</dl>
    </section>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export default function SystemHealthPage() {
  return <SystemHealthContent />;
}
