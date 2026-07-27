"use client";

import {
  BookOpen,
  ChevronsUpDown,
  ExternalLink,
  Server,
  Settings,
} from "lucide-react";
import Link from "next/link";

import { ThemeMenuSub } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type {
  StudioConnectionStatus,
  StudioShellContext,
} from "@/lib/studio-context-model";
import { cn } from "@/lib/utils";

const statusClass: Record<StudioConnectionStatus, string> = {
  connected: "bg-emerald-500",
  misconfigured: "bg-amber-500",
  unauthorized: "bg-destructive",
  unavailable: "bg-destructive",
};

export function NavUser({
  studioContext,
}: {
  studioContext: StudioShellContext;
}) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={`Open Studio menu. ${studioContext.connection.label}.`}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
                <Server className="size-4" aria-hidden="true" />
                <span
                  className={cn(
                    "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-sidebar",
                    statusClass[studioContext.connection.status],
                  )}
                  aria-hidden="true"
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {studioContext.identity.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {studioContext.connection.label}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="grid gap-1 px-2 py-2 text-left text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      statusClass[studioContext.connection.status],
                    )}
                    aria-hidden="true"
                  />
                  <span className="font-medium">
                    {studioContext.connection.label}
                  </span>
                </div>
                <span
                  className="truncate text-xs text-muted-foreground"
                  title={`${studioContext.identity.name} / ${studioContext.scope.project}`}
                >
                  {studioContext.identity.name} / {studioContext.scope.project}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {studioContext.identity.access}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href="https://kortyx.io/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  <BookOpen />
                  Documentation
                  <ExternalLink className="ml-auto size-3.5 text-muted-foreground" />
                </a>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <ThemeMenuSub />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center justify-between px-2 py-1.5 text-xs font-normal text-muted-foreground">
              <span>Studio</span>
              <span className="font-mono">
                v{studioContext.identity.version}
              </span>
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
