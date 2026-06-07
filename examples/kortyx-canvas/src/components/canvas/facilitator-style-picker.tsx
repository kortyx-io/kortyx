"use client";

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
      <select
        value={value ?? ""}
        onChange={(event) => onValueChange(event.target.value || undefined)}
        className="h-10 cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">No facilitator style</option>
        {facilitatorStyles.map((facilitatorStyle) => (
          <option key={facilitatorStyle.id} value={facilitatorStyle.id}>
            {facilitatorStyle.name}
          </option>
        ))}
      </select>
    </label>
  );
}
