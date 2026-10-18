"use client";
import type { StudioTimeRange } from "@kortyx/telemetry-contracts";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimeRangeFilter } from "./time-range-filter";
import type { DataTableScopeFilter } from "./types";

export function DataTableScope({
  fields,
  values,
  onChange,
}: {
  fields: readonly DataTableScopeFilter[];
  values: Record<string, string | boolean | null>;
  onChange: (patch: Record<string, string | boolean | null>) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => {
        const value = values[field.key] ?? field.defaultValue;
        if (field.kind === "timeRange")
          return (
            <section key={field.key}>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                {field.label}
              </h3>
              <TimeRangeFilter
                range={value as StudioTimeRange}
                startedAfter={String(values[field.afterKey] ?? "")}
                startedBefore={String(values[field.beforeKey] ?? "")}
                onChange={(next) =>
                  onChange({
                    [field.key]:
                      next.range === field.defaultValue ? null : next.range,
                    [field.afterKey]: next.startedAfter || null,
                    [field.beforeKey]: next.startedBefore || null,
                  })
                }
              />
            </section>
          );
        if (field.kind === "boolean")
          return (
            <label key={field.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value === true || value === "true"}
                onChange={(event) =>
                  onChange({
                    [field.key]:
                      event.target.checked === Boolean(field.defaultValue)
                        ? null
                        : event.target.checked,
                  })
                }
              />
              {field.label}
            </label>
          );
        if (field.kind === "enum")
          return (
            <section key={field.key}>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                {field.label}
              </h3>
              <Select
                value={String(value)}
                onValueChange={(next) =>
                  onChange({
                    [field.key]: next === field.defaultValue ? null : next,
                  })
                }
              >
                <SelectTrigger aria-label={field.label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          );
        return (
          <label
            key={field.key}
            htmlFor={`${id}-${field.key}`}
            className="flex flex-col gap-2 text-xs font-medium"
          >
            {field.label}
            <Input
              id={`${id}-${field.key}`}
              aria-label={field.label}
              value={String(value ?? "")}
              placeholder={field.placeholder}
              onChange={(event) =>
                onChange({ [field.key]: event.target.value || null })
              }
            />
          </label>
        );
      })}
    </div>
  );
}
