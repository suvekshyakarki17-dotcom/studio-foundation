import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Building2, Contact, Globe, Megaphone } from "lucide-react";
import { useNavigate } from "react-router";
import type { CreateTarget } from "./nav";
import { NAV_ITEMS } from "./nav";

/**
 * Command palette (⌘K / Ctrl+K). Only commands that actually work:
 * navigation to real routes and the four real create actions.
 */
export function CommandMenu({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (target: CreateTarget) => void;
}) {
  const navigate = useNavigate();
  const close = () => onOpenChange(false);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Commands"
      description="Agency Studio commands"
    >
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.to}
              value={`${item.label} ${item.to}`}
              onSelect={() => {
                close();
                navigate(item.to);
              }}
            >
              <item.icon className="size-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem
            value="New business Add to pipeline Create business"
            onSelect={() => {
              close();
              onCreate("business");
            }}
          >
            <Contact className="size-4" />
            New business
          </CommandItem>
          <CommandItem
            value="New campaign Create campaign"
            onSelect={() => {
              close();
              onCreate("campaign");
            }}
          >
            <Megaphone className="size-4" />
            New campaign
          </CommandItem>
          <CommandItem
            value="New client Create client"
            onSelect={() => {
              close();
              onCreate("client");
            }}
          >
            <Building2 className="size-4" />
            New client
          </CommandItem>
          <CommandItem
            value="New website project Create project"
            onSelect={() => {
              close();
              onCreate("project");
            }}
          >
            <Globe className="size-4" />
            New website project
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
