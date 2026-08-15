import { Link, NavLink } from "react-router";
import { cn } from "@/lib/utils";
import { PHASE_LABEL } from "@/shared/domain";
import { FUTURE_ITEMS, NAV_SECTIONS } from "./nav";
import { StudioMark } from "./studio-mark";

/**
 * Sidebar content, shared between the fixed desktop rail and the mobile
 * sheet. `onNavigate` closes the mobile sheet after navigation.
 */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-5">
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <StudioMark className="size-7 text-foreground" />
          <span className="leading-tight">
            <span className="block font-display text-[15px] tracking-tight text-foreground">
              Agency Studio
            </span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {PHASE_LABEL}
            </span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Studio">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-6">
            <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                        isActive
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Later phases
          </p>
          <ul className="space-y-0.5">
            {FUTURE_ITEMS.map((item) => (
              <li key={item.label}>
                <span
                  aria-disabled="true"
                  title="Planned for a later phase — not implemented yet"
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-muted-foreground/50"
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                  <span className="ml-auto rounded-sm border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
                    Soon
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="shrink-0 border-t border-sidebar-border px-5 py-4">
        <p className="text-[11px] leading-4 text-muted-foreground">
          Private workspace
          <br />
          <span className="text-muted-foreground/70">One operator · real data</span>
        </p>
      </div>
    </div>
  );
}
