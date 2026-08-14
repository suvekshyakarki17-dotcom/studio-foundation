import { useAuth } from "@/hooks/use-auth";
import { initials } from "@/lib/format";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { PageHeader } from "@/components/studio/page-header";
import { StatusBadge } from "@/components/studio/status-badge";
import {
  APP_NAME,
  APP_VERSION,
  KNOWN_PROVIDERS,
  PROVIDER_STATUS_LABELS,
  PROVIDER_STATUS_TONES,
} from "@/shared/domain";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Workspace and account details. Settings here reflect what actually exists — no fake toggles."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section
          aria-label="Account"
          className="rounded-md border border-border bg-card"
        >
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-display text-lg tracking-tight text-foreground">
              Account
            </h2>
          </div>
          <div className="flex items-center gap-4 px-5 py-5">
            <Avatar className="size-12">
              {user?.image && <AvatarImage src={user.image} alt="" />}
              <AvatarFallback className="border border-border bg-muted text-sm text-foreground">
                {initials(user?.name ?? user?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">
                {user?.name ?? "Studio operator"}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {user?.email ?? "Signed in"}
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Workspace"
          className="rounded-md border border-border bg-card"
        >
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-display text-lg tracking-tight text-foreground">
              Workspace
            </h2>
          </div>
          <dl className="space-y-3 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm text-muted-foreground">Name</dt>
              <dd className="text-sm font-medium text-foreground">{APP_NAME}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm text-muted-foreground">Phase</dt>
              <dd className="text-sm font-medium text-foreground">
                01 — Foundation
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm text-muted-foreground">Version</dt>
              <dd className="text-sm font-medium text-foreground">
                v{APP_VERSION}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm text-muted-foreground">Backend</dt>
              <dd className="text-sm font-medium text-foreground">
                Convex · Postgres-backed
              </dd>
            </div>
          </dl>
        </section>

        <section
          aria-label="Integrations"
          className="rounded-md border border-border bg-card lg:col-span-2"
        >
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-display text-lg tracking-tight text-foreground">
              Integrations
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Provider slots reserved by the architecture. None are connected
              in Phase 1 — connecting them belongs to later phases, and the
              UI will only ever show what is actually configured.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 py-5 sm:grid-cols-2">
            {KNOWN_PROVIDERS.map((provider) => (
              <div
                key={provider.type}
                className="flex items-start justify-between gap-3"
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
                  label={PROVIDER_STATUS_LABELS.NOT_CONFIGURED}
                  tone={PROVIDER_STATUS_TONES.NOT_CONFIGURED}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
