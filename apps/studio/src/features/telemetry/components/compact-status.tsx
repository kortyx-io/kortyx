import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type CompactStatusMeta = {
  label: string;
  icon: LucideIcon;
  className: string;
  animate?: boolean;
};

export function CompactStatus({ meta }: { meta: CompactStatusMeta }) {
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "flex max-w-full min-w-0 items-center gap-2 text-xs font-medium",
        meta.className,
      )}
    >
      <Icon className={cn("size-4 shrink-0", meta.animate && "animate-spin")} />
      <span className="truncate">{meta.label}</span>
    </span>
  );
}
