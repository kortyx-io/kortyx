"use client";

import { ChevronDown } from "lucide-react";
import type { FacilitatorStyleOption } from "@/services/demo-data";

export default function FacilitatorStylePicker({
  value,
  onValueChange,
  facilitatorStyles,
}: {
  value: string | undefined;
  onValueChange: (value: string | undefined) => void;
  facilitatorStyles: FacilitatorStyleOption[];
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-2 text-muted-foreground text-xs">
        Facilitator style
      </span>
      <span className="relative">
        <select
          value={value ?? ""}
          onChange={(event) => onValueChange(event.target.value || undefined)}
          className="h-10 w-full cursor-pointer appearance-none rounded-md border border-input bg-background px-3 pr-10 text-sm"
        >
          <option value="">No facilitator style</option>
          {facilitatorStyles.map((facilitatorStyle) => (
            <option key={facilitatorStyle.id} value={facilitatorStyle.id}>
              {facilitatorStyle.name}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </span>
    </label>
  );
}
