"use client";

import {
  Activity,
  ChevronsUpDown,
  CirclePause,
  MessageSquare,
  Settings,
  Workflow,
} from "lucide-react";
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

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Kortyx">
              <Link href="/">
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                  <img
                    src="/favicon.ico"
                    alt="Kortyx"
                    className="size-8"
                    width={32}
                    height={32}
                  />
                </div>
                <div className="grid flex-1 gap-0.5 text-left leading-none group-data-[collapsible=icon]:hidden">
                  <span className="font-semibold">Kortyx</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Project / Env
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
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
                <SidebarMenuButton asChild tooltip="Settings">
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
        <NavUser
          user={{
            name: "User",
            email: "user@kortyx.dev",
            avatar: "",
          }}
        />
      </SidebarFooter>
      <SidebarRail className="mt-12 mb-4" />
    </Sidebar>
  );
}
