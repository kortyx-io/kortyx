"use client";

import { parseAsString, useQueryState } from "nuqs";
import { Children, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SettingsPanelProps {
  id: string;
  label: string;
  children: ReactNode;
}
export function SettingsPanel({ children }: SettingsPanelProps) {
  return <>{children}</>;
}

export function SettingsNavigation({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useQueryState(
    "section",
    parseAsString.withDefault("general"),
  );
  const panels = Children.toArray(children).filter((child) =>
    isValidElement<SettingsPanelProps>(child),
  );
  const active =
    panels.find((panel) => panel.props.id === selected) ?? panels[0];
  return (
    <div className="grid min-w-0 gap-6 p-4 sm:p-6 md:grid-cols-[12rem_minmax(0,1fr)]">
      <nav
        aria-label="Settings sections"
        className="flex gap-1 overflow-x-auto md:flex-col"
      >
        {panels.map((panel) => (
          <button
            type="button"
            key={panel.props.id}
            aria-current={active === panel ? "page" : undefined}
            onClick={() => void setSelected(panel.props.id)}
            className={cn(
              "shrink-0 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              active === panel && "bg-muted font-medium text-foreground",
            )}
          >
            {panel.props.label}
          </button>
        ))}
      </nav>
      <section aria-label={active?.props.label} className="min-w-0 space-y-4">
        {active}
      </section>
    </div>
  );
}
