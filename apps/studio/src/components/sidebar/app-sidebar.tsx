"use client";

import type { StudioShellContribution } from "@studio/shell-contracts";
import {
  Activity,
  CirclePause,
  FileText,
  FlaskConical,
  MessageSquare,
  Settings,
  Workflow,
} from "lucide-react";
import Image from "next/image";
import Link from "@/components/scoped-link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { usePathname, useSearchParams } from "@/lib/scoped-navigation";
import type { StudioShellContext } from "@/lib/studio-context-model";
import { NavUser } from "./nav-user";

const navSections = [
  {
    title: "Observe",
    items: [
      { title: "Runs", url: "/runs", icon: Activity },
      { title: "Sessions", url: "/sessions", icon: MessageSquare },
      { title: "Workflows", url: "/workflows", icon: Workflow },
      { title: "Interrupts", url: "/interrupts", icon: CirclePause },
    ],
  },
  {
    title: "Evaluate",
    items: [{ title: "Evals", url: "/evals/runs", icon: FlaskConical }],
  },
  {
    title: "Prompt Management",
    items: [{ title: "Prompts", url: "/prompts", icon: FileText }],
  },
];

export function AppSidebar({
  studioContext,
  shell,
}: {
  studioContext: StudioShellContext;
  shell: StudioShellContribution;
}) {
  const pathname = usePathname();
  const environment = useSearchParams().get("env");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Kortyx Studio">
              <Link href="/" className="group gap-2.5 tracking-[-0.01em]">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-white shadow-sm transition-transform group-hover:-rotate-3">
                  <Image
                    src="/logo.png"
                    alt=""
                    width={24}
                    height={24}
                    preload
                  />
                </span>
                <div className="grid flex-1 gap-0.5 text-left leading-none group-data-[collapsible=icon]:hidden">
                  <span
                    className="truncate text-[15px] font-semibold"
                    title="Kortyx"
                  >
                    Kortyx
                  </span>
                  <span
                    className="truncate text-xs text-muted-foreground"
                    title={`v${studioContext.identity.version}`}
                  >
                    v{studioContext.identity.version}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navSections.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      className="text-xs"
                      asChild
                      tooltip={item.title}
                      isActive={
                        pathname === item.url ||
                        pathname.startsWith(`${item.url}/`) ||
                        (item.title === "Evals" &&
                          pathname.startsWith("/evals/"))
                      }
                    >
                      <Link
                        href={
                          environment
                            ? `${item.url}?env=${encodeURIComponent(environment)}`
                            : item.url
                        }
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-xs"
                  asChild
                  tooltip="Settings"
                  isActive={
                    pathname === "/settings" ||
                    pathname.startsWith("/settings/")
                  }
                >
                  <Link href="/settings">
                    <Settings />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-4">
        <NavUser studioContext={studioContext} account={shell.account} />
      </SidebarFooter>
      <SidebarRail className="mt-12 mb-4" />
    </Sidebar>
  );
}
