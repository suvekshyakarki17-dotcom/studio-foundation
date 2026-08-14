import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { APP_VERSION } from "@/shared/domain";
import { ClientFormDialog } from "./client-form-dialog";
import { CommandMenu } from "./command-menu";
import { LeadFormDialog } from "./lead-form-dialog";
import type { CreateTarget } from "./nav";
import { ProjectFormDialog } from "./project-form-dialog";
import { SidebarContent } from "./sidebar";
import { Topbar } from "./topbar";

/** Passed through the router <Outlet /> context so pages can open the
 *  shell-owned create dialogs. */
export interface StudioOutletContext {
  openCreate: (target: CreateTarget) => void;
}

export default function AppShell() {
  const [commandOpen, setCommandOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const recordBoot = useMutation(api.system.recordBoot);

  // Idempotent: records the first boot of this deployment.
  useEffect(() => {
    void recordBoot();
  }, [recordBoot]);

  // ⌘K / Ctrl+K toggles the command palette.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openCreate = (target: CreateTarget) => setCreateTarget(target);
  const closeCreate = (open: boolean) => {
    if (!open) setCreateTarget(null);
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <Topbar onOpenCommand={() => setCommandOpen(true)} />
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet context={{ openCreate }} />
          </div>
        </main>
        <footer className="shrink-0 border-t border-border px-6 py-4">
          <p className="text-[11px] text-muted-foreground">
            Agency Studio · Phase 01 — Foundation · v{APP_VERSION}
          </p>
        </footer>
      </div>

      <CommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onCreate={openCreate}
      />

      {/* Shell-owned create dialogs; edit dialogs live on their pages. */}
      <LeadFormDialog
        open={createTarget === "lead"}
        onOpenChange={closeCreate}
      />
      <ClientFormDialog
        open={createTarget === "client"}
        onOpenChange={closeCreate}
      />
      <ProjectFormDialog
        open={createTarget === "project"}
        onOpenChange={closeCreate}
      />
    </div>
  );
}
