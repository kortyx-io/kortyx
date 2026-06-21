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
        "flex items-center gap-2 text-xs font-medium",
        meta.className,
      )}
    >
      <Icon className={cn("size-4", meta.animate && "animate-spin")} />
      {meta.label}
    </span>
  );
}
