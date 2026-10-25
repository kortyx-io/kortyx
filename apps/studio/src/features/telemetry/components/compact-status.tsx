"use client";

import type { LucideIcon } from "lucide-react";
import { TableValueFilter } from "@/components/data-table/table-value-filter";
import { cn } from "@/lib/utils";

export type CompactStatusMeta = {
  label: string;
  icon: LucideIcon;
  className: string;
  animate?: boolean;
};

export function CompactStatus({
  meta,
  filterValue,
  filterField = "status",
}: {
  meta: CompactStatusMeta;
  filterValue?: string;
  filterField?: string;
}) {
  const Icon = meta.icon;
  const content = (
    <span
      className={cn(
        "flex max-w-full min-w-0 items-center justify-start gap-2 text-left text-xs font-medium",
        meta.className,
      )}
    >
      <Icon className={cn("size-4 shrink-0", meta.animate && "animate-spin")} />
      <span className="truncate">{meta.label}</span>
    </span>
  );
  return filterValue === undefined ? (
    content
  ) : (
    <TableValueFilter value={filterValue} field={filterField}>
      {content}
    </TableValueFilter>
  );
}
