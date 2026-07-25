"use client";

import {
  Activity,
  CirclePause,
  MessageSquare,
  Settings,
  Workflow,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
];

export function AppSidebar({
  studioContext,
}: {
  studioContext: StudioShellContext;
}) {
  const pathname = usePathname();
  const environmentLabel =
    studioContext.workspace.environments.length === 1
      ? studioContext.workspace.environments[0]
      : `${studioContext.workspace.environments.length} environments`;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip={studioContext.workspace.project}
            >
              <Link href="/settings">
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                  <Image
                    src="/favicon.ico"
                    alt="Kortyx"
                    className="size-8"
                    width={32}
                    height={32}
                  />
                </div>
                <div className="grid flex-1 gap-0.5 text-left leading-none group-data-[collapsible=icon]:hidden">
                  <span
                    className="truncate font-semibold"
                    title={studioContext.workspace.project}
                  >
                    {studioContext.workspace.project}
                  </span>
                  <span
                    className="truncate text-xs text-muted-foreground"
                    title={environmentLabel}
                  >
                    {environmentLabel}
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
                      asChild
                      tooltip={item.title}
                      isActive={
                        pathname === item.url ||
                        pathname.startsWith(`${item.url}/`)
                      }
                    >
                      <Link href={item.url}>
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
        <NavUser studioContext={studioContext} />
      </SidebarFooter>
      <SidebarRail className="mt-12 mb-4" />
    </Sidebar>
  );
}
