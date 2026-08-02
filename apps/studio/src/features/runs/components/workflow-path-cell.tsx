import { cn } from "@/lib/utils";

export function workflowPathTitle(path: string[]): string | undefined {
  if (path.length === 0) return undefined;
  return path.join(" → ");
}

/** Collapse long paths to first → … → last; short paths stay intact. */
function pathSegments(path: string[]): string[] {
  if (path.length <= 3) return path;
  const [first] = path;
  const last = path.at(-1);
  return first && last ? [first, "…", last] : path;
}

export function WorkflowPathCell({ path }: { path: string[] }) {
  if (path.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const segments = pathSegments(path);

  return (
    <p className="min-w-0 truncate text-xs text-muted-foreground">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const isEllipsis = segment === "…";
        const position = index === 0 ? "first" : isLast ? "last" : "middle";

        return (
          <span key={position}>
            {index > 0 && <span aria-hidden="true"> → </span>}
            <span
              className={cn(
                isEllipsis && "px-0.5 text-border",
                isLast && !isEllipsis && "font-medium text-foreground",
              )}
            >
              {segment}
            </span>
          </span>
        );
      })}
    </p>
  );
}
