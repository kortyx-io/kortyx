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
    <header className="shrink-0 bg-background px-5 pt-4 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
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
