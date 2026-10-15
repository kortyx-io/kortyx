"use client";
import {
  filterOperators,
  type StudioTableResource,
  type TableFilterRule,
} from "@kortyx/telemetry-contracts";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSearchParams } from "@/lib/scoped-navigation";
import { studioFetch } from "@/lib/studio-fetch";
import type { DataTableFilter } from "./types";

const operatorLabels: Record<TableFilterRule["operator"], string> = {
  contains: "Contains",
  notContains: "Does not contain",
  is: "Is any of",
  isNot: "Is none of",
  gt: "Greater than",
  gte: "At least",
  lt: "Less than",
  lte: "At most",
  between: "Between",
  present: "Has a value",
  missing: "Has no value",
};
export function FilterRuleEditor<T>({
  rule,
  field,
  data,
  resource,
  index,
  onChange,
}: {
  rule: TableFilterRule;
  field?: DataTableFilter<T>;
  data: T[];
  resource?: StudioTableResource | "prompts" | "evaluations";
  index: number;
  onChange: (rule: TableFilterRule) => void;
}) {
  const id = useId();
  const search = useSearchParams();
  const [remote, setRemote] = useState<string[]>([]);
  const [suggestionError, setSuggestionError] = useState(false);
  const value = String(rule.values[0] ?? "");
  const scope = new URLSearchParams(
    [...search.entries()].filter(([key]) =>
      [
        "env",
        "range",
        "startedAfter",
        "startedBefore",
        "archived",
        "categoryId",
      ].includes(key),
    ),
  ).toString();
  const kind = field?.kind;
  useEffect(() => {
    if (!resource || !kind || !["text", "enum"].includes(kind)) return;
    setRemote([]);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSuggestionError(false);
      studioFetch(
        `/api/studio/filter-values?${new URLSearchParams({ resource, field: rule.field, search: kind === "enum" ? "" : value })}&${scope}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const result = await response.json();
          setRemote(
            Array.isArray(result.values)
              ? result.values.filter((v: unknown) => typeof v === "string")
              : [],
          );
        })
        .catch(() => {
          if (!controller.signal.aborted) setSuggestionError(true);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [resource, kind, rule.field, value, scope]);
  if (!field) return <p role="alert">Unknown filter field</p>;
  const suggestions = resource
    ? remote
    : [
        ...new Set(
          data.flatMap((row) => {
            const value = field.read(row);
            return (Array.isArray(value) ? value : [value])
              .filter((v) => v !== null && v !== undefined)
              .map(String);
          }),
        ),
      ]
        .filter((v) => v.toLowerCase().includes(value.toLowerCase()))
        .sort()
        .slice(0, 50);
  const options = [...new Set([...(field.options ?? []), ...suggestions])];
  const noValue = rule.operator === "present" || rule.operator === "missing";
  return (
    <>
      <Select
        value={rule.operator}
        onValueChange={(operator) =>
          onChange({
            ...rule,
            operator: operator as TableFilterRule["operator"],
            values:
              operator === "present" || operator === "missing"
                ? []
                : rule.values,
          })
        }
      >
        <SelectTrigger aria-label={`Filter ${index + 1} operator`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {filterOperators(field.kind).map((operator) => (
            <SelectItem key={operator} value={operator}>
              {operatorLabels[operator]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!noValue &&
        (field.kind === "boolean" ? (
          <Select
            value={String(rule.values[0] ?? "")}
            onValueChange={(value) =>
              onChange({ ...rule, values: [value === "true"] })
            }
          >
            <SelectTrigger aria-label={`${field.label} value`}>
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <>
            {(rule.operator === "between"
              ? [0, 1]
              : rule.operator === "is" || rule.operator === "isNot"
                ? Array.from(
                    { length: Math.max(1, rule.values.length) },
                    (_, i) => i,
                  )
                : [0]
            ).map((position) => (
              <Input
                key={position}
                aria-label={`${field.label}${rule.operator === "between" ? (position === 0 ? " minimum" : " maximum") : position === 0 ? " value" : ` value ${position + 1}`}`}
                placeholder={field.unit ?? "Value…"}
                type={
                  field.kind === "number"
                    ? "number"
                    : field.kind === "date"
                      ? "datetime-local"
                      : "text"
                }
                step="any"
                list={
                  field.kind === "text" || field.kind === "enum"
                    ? id
                    : undefined
                }
                value={
                  field.kind === "date" && rule.values[position]
                    ? String(rule.values[position])
                        .replace(/Z$/, "")
                        .slice(0, 19)
                    : String(rule.values[position] ?? "")
                }
                onChange={(event) => {
                  const raw = event.target.value;
                  const values = [...rule.values];
                  if (!raw) values.splice(position, 1);
                  else
                    values[position] =
                      field.kind === "number"
                        ? Number(raw)
                        : field.kind === "date"
                          ? `${raw.length === 16 ? `${raw}:00` : raw}Z`
                          : raw;
                  onChange({ ...rule, values });
                }}
              />
            ))}
            {(rule.operator === "is" || rule.operator === "isNot") &&
              rule.values.length > 0 &&
              rule.values.length < 30 && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    onChange({ ...rule, values: [...rule.values, ""] })
                  }
                >
                  Add another value
                </Button>
              )}
            <datalist id={id}>
              {options.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            {(rule.operator === "is" || rule.operator === "isNot") &&
              field.kind !== "number" &&
              field.kind !== "date" && (
                <div className="space-y-1">
                  {options
                    .filter((option) => !rule.values.includes(option))
                    .slice(0, 8)
                    .map((option) => (
                      <Button
                        key={option}
                        size="xs"
                        variant="ghost"
                        className="max-w-full truncate"
                        onClick={() =>
                          onChange({
                            ...rule,
                            values: [...rule.values, option],
                          })
                        }
                      >
                        + {option}
                      </Button>
                    ))}
                </div>
              )}
            {field.kind === "date" && (
              <p className="text-[11px] text-muted-foreground">
                UTC date and time
              </p>
            )}
            {suggestionError && (
              <p className="text-xs text-muted-foreground">
                Suggestions unavailable. You can still enter a value.
              </p>
            )}
          </>
        ))}
    </>
  );
}
