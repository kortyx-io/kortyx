import type { ReactNode } from "react";

/** Page context stays separate from the shared table search and controls. */
export function TablePageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b bg-background px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold">{title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </header>
  );
}
