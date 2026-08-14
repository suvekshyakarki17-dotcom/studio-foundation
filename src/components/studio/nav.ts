import {
  Activity as ActivityIcon,
  Building2,
  Contact,
  FolderGit2,
  Globe,
  History,
  LayoutGrid,
  PenTool,
  Send,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/** Routes that actually exist in the studio (see src/main.tsx). */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Overview", icon: LayoutGrid, end: true },
      { to: "/dashboard/leads", label: "Leads", icon: Contact },
      { to: "/dashboard/websites", label: "Websites", icon: Globe },
      { to: "/dashboard/clients", label: "Clients", icon: Building2 },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/dashboard/activity", label: "Activity", icon: History },
      { to: "/dashboard/system", label: "System health", icon: ActivityIcon },
      { to: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap(
  (section) => section.items,
);

/** Planned modules — visible but explicitly unavailable in Phase 1. */
export const FUTURE_ITEMS: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Intelligence", icon: Sparkles },
  { label: "Repository Lab", icon: FolderGit2 },
  { label: "Website Factory", icon: PenTool },
  { label: "Outreach", icon: Send },
];

export type CreateTarget = "lead" | "client" | "project";

/** Page titles/descriptions for the topbar context line. */
export const PAGE_META: Record<string, { title: string; description: string }> = {
  "/dashboard": {
    title: "Overview",
    description: "The current state of your studio, from real data.",
  },
  "/dashboard/leads": {
    title: "Leads",
    description: "Businesses you're tracking as potential engagements.",
  },
  "/dashboard/websites": {
    title: "Websites",
    description: "Website engagements in the studio's pipeline.",
  },
  "/dashboard/clients": {
    title: "Clients",
    description: "The studio's clients and their engagements.",
  },
  "/dashboard/activity": {
    title: "Activity",
    description: "A chronological log of real operations.",
  },
  "/dashboard/system": {
    title: "System health",
    description: "Live status of the application, database, and integrations.",
  },
  "/dashboard/settings": {
    title: "Settings",
    description: "Workspace and account details.",
  },
};
