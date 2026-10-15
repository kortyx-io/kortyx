import { Clipboard } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <Button
        variant="secondary"
        size="icon-xs"
        type="button"
        aria-label={ariaLabel}
        onClick={(event) => {
          event.stopPropagation();
          onCopy(value);
        }}
        className={cn(
          "absolute top-1/2 right-0 z-10 -translate-y-1/2",
          "pointer-events-none opacity-0",
          "group-hover:pointer-events-auto group-hover:opacity-100",
          "focus:pointer-events-auto focus:opacity-100",
        )}
      >
        <Clipboard />
      </Button>
    </div>
  );
}
