import { Clipboard } from "lucide-react";
import { cn } from "@/lib/utils";

type CopyableCellProps = {
  value: string;
  onCopy: (value: string) => void;
  ariaLabel?: string;
  className?: string;
};

export function CopyableCell({
  value,
  onCopy,
  ariaLabel = "Copy",
  className,
}: CopyableCellProps) {
  return (
    <div
      className={cn(
        "relative min-w-0 overflow-hidden font-mono text-xs text-muted-foreground",
        className,
      )}
    >
      <span className="block truncate">{value}</span>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={(event) => {
          event.stopPropagation();
          onCopy(value);
        }}
        className={cn(
          "absolute top-1/2 right-0 z-10 -translate-y-1/2 rounded p-0.5",
          "pointer-events-none bg-background/90 opacity-0 shadow-sm backdrop-blur-sm",
          "hover:bg-accent group-hover:pointer-events-auto group-hover:opacity-100",
          "focus:pointer-events-auto focus:opacity-100",
        )}
      >
        <Clipboard className="size-3" />
      </button>
    </div>
  );
}
