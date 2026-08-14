import { useAuth } from "@/hooks/use-auth";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Home, LogOut, Menu, Search } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { PAGE_META } from "./nav";
import { SidebarContent } from "./sidebar";
import { StudioMark } from "./studio-mark";
import { SystemStatusChip } from "./system-status-chip";

export function Topbar({
  onOpenCommand,
}: {
  onOpenCommand: () => void;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const page = PAGE_META[location.pathname] ?? PAGE_META["/dashboard"];

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate("/");
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {/* Mobile: brand + nav drawer */}
        <div className="flex items-center gap-2 lg:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                aria-label="Open navigation"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-0">
              <SheetTitle className="sr-only">Studio navigation</SheetTitle>
              <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>
          <LinkToHome />
        </div>
        {/* Desktop: workspace context */}
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Workspace / {page.title}
          </p>
          <p className="truncate text-sm text-foreground">{page.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <SystemStatusChip />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenCommand}
          className="hidden text-muted-foreground md:inline-flex"
        >
          <Search className="size-3.5" />
          <span>Search</span>
          <Kbd className="ml-3">⌘K</Kbd>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onOpenCommand}
          className="text-muted-foreground md:hidden"
          aria-label="Open command palette"
        >
          <Search className="size-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="Account menu"
            >
              <Avatar className="size-8">
                {user?.image && <AvatarImage src={user.image} alt="" />}
                <AvatarFallback className="border border-border bg-muted text-xs text-foreground">
                  {initials(user?.name ?? user?.email)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="truncate text-sm font-medium text-foreground">
                {user?.name ?? "Studio operator"}
              </p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {user?.email ?? "Signed in"}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigate("/")}
              className="cursor-pointer"
            >
              <Home className="size-4" />
              Landing page
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigate("/dashboard/settings")}
              className="cursor-pointer"
            >
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              variant="destructive"
              className="cursor-pointer"
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function LinkToHome() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/")}
      className="flex items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label="Go to Agency Studio home"
    >
      <StudioMark className={cn("size-6 text-foreground")} />
      <span className="font-display text-[15px] tracking-tight text-foreground">
        Agency Studio
      </span>
    </button>
  );
}
