import type { ReactNode } from "react";
import { DetailSurfaceProvider } from "@/components/detail/detail-drawer";
import { OverflowText } from "@/components/ui/overflow-tooltip";

export function DetailPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <div className="min-w-0 flex-1">
          <h1 aria-label={title} className="min-w-0 text-sm font-semibold">
            <OverflowText ariaLabel={title}>{title}</OverflowText>
          </h1>
          <p className="min-w-0 text-xs text-muted-foreground">
            <OverflowText ariaLabel={description}>{description}</OverflowText>
          </p>
        </div>
      </header>
      <DetailSurfaceProvider>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </DetailSurfaceProvider>
    </div>
  );
}
