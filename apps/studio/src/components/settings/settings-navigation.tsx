"use client";

import type { StudioSettingsGroup } from "@studio/settings-contracts";
import {
  Building2,
  Cable,
  FlaskConical,
  Globe,
  Info,
  KeyRound,
  Palette,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Children, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SettingsPanelProps {
  id: string;
  label: string;
  children: ReactNode;
  group?: StudioSettingsGroup;
}
export function SettingsPanel({ children }: SettingsPanelProps) {
  return <>{children}</>;
}

export function SettingsNavigation({ children }: { children: ReactNode }) {
  const selected = usePathname().split("/")[2] ?? "general";
  const panels = Children.toArray(children).filter((child) =>
    isValidElement<SettingsPanelProps>(child),
  );
  const active =
    panels.find((panel) => panel.props.id === selected) ?? panels[0];
  const groups: StudioSettingsGroup[] = [
    "Personal",
    "Organization",
    "Project",
    "Installation",
  ];
  const icons = {
    general: Settings,
    account: UserRound,
    members: Users,
    project: Building2,
    environments: Globe,
    connection: Cable,
    "api-keys": KeyRound,
    evaluations: FlaskConical,
    privacy: ShieldCheck,
    appearance: Palette,
    about: Info,
    access: ShieldCheck,
  };
  return (
    <div className="grid h-full min-w-0 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[13rem_minmax(0,1fr)] md:grid-rows-1">
      <nav
        aria-label="Settings sections"
        className="flex gap-3 overflow-x-auto border-b px-3 py-5 md:flex-col md:gap-6 md:overflow-y-auto md:border-r md:border-b-0 md:py-8"
      >
        {groups.map((group) => {
          const items = panels.filter(
            (panel) => (panel.props.group ?? "Installation") === group,
          );
          if (!items.length) return null;
          return (
            <div key={group} className="shrink-0 space-y-1">
              <p className="mb-2 px-3 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                {group}
              </p>
              {items.map((panel) => {
                const Icon =
                  icons[panel.props.id as keyof typeof icons] ?? Settings;
                return (
                  <Link
                    key={panel.props.id}
                    aria-current={active === panel ? "page" : undefined}
                    href={`/settings/${panel.props.id}`}
                    className={cn(
                      "flex w-full shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                      active === panel &&
                        "bg-muted font-medium text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {panel.props.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <section
        aria-label={active?.props.label}
        className="min-w-0 space-y-8 overflow-y-auto p-5 md:p-8"
      >
        {active}
      </section>
    </div>
  );
}
