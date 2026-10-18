import type { ReactNode } from "react";
import { HelpCircle, type HelpDefinition } from "@/components/ui/info-tooltip";

/** Page context stays separate from the shared table search and controls. */
export function TablePageHeader({
  title,
  description,
  actions,
  children,
  help,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
  help?: HelpDefinition;
}) {
  return (
    <header
      data-page-help="header"
      className="shrink-0 bg-background px-5 pt-4 pb-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {help && <HelpCircle help={help} />}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </header>
  );
}
