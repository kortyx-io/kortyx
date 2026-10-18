import type { ReactNode } from "react";

export function PromptLiveBadge({ version }: { version?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/25">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-emerald-500"
      />
      {version === undefined ? "Live" : `v${version}`}
    </span>
  );
}

export function PromptTagBadge({
  tag,
  children,
}: {
  tag: string;
  children?: ReactNode;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-normal text-muted-foreground ring-1 ring-inset ring-border/60">
      <span className="truncate" title={tag}>
        {tag}
      </span>
      {children}
    </span>
  );
}
