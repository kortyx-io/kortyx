"use client";

import type {
  StudioTableResource,
  TableFilterRule,
} from "@kortyx/telemetry-contracts";
import { MoreHorizontal, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DataTableFilter } from "./types";
import { useFilterValues } from "./use-filter-values";

const statusOptions: Record<string, string[]> = {
  runs: [
    "running",
    "completed",
    "interrupted",
    "incomplete",
    "failed",
    "cancelled",
  ],
  sessions: [
    "running",
    "completed",
    "interrupted",
    "incomplete",
    "failed",
    "cancelled",
  ],
  interrupts: ["pending", "resolved", "expired", "failed", "cancelled"],
  evaluations: ["queued", "running", "passed", "failed", "error", "cancelled"],
};
const labels: Record<string, string> = {
  is: "Is any of",
  isNot: "Is none of",
  contains: "Contains",
  notContains: "Does not contain",
  present: "Has a value",
  missing: "Has no value",
};

/** Listed controls: choosing values is enough; no condition needs to be created. */
export function DataTableFilterField<T>({
  field,
  rules,
  data,
  resource,
  onChange,
}: {
  field: DataTableFilter<T>;
  rules: TableFilterRule[];
  data: T[];
  resource?: StudioTableResource | "prompts" | "evaluations";
  onChange: (rules: TableFilterRule[], immediate?: boolean) => void;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [search, setSearch] = useState("");
  const rule = rules[0];
  const [chosenOperator, setChosenOperator] = useState<
    TableFilterRule["operator"] | undefined
  >();
  useEffect(() => {
    if (!rules.length) setChosenOperator(undefined);
  }, [rules.length]);
  const ranged = field.kind === "number" || field.kind === "date";
  const operator =
    rule?.operator ??
    chosenOperator ??
    (field.kind === "text" ? "contains" : "is");
  const noValue = operator === "missing" || operator === "present";
  const text = String(rule?.values[0] ?? "");
  const enabled = field.kind === "enum" || focused;
  const needle = field.kind === "enum" ? search : text;
  const { values: remote, unavailable } = useFilterValues(
    resource,
    field.key,
    needle,
    enabled && ["text", "enum"].includes(field.kind),
  );
  const options = [
    ...new Set([
      ...(field.options ?? []),
      ...(field.key === "status" && resource
        ? (statusOptions[resource] ?? [])
        : []),
      ...(resource
        ? remote
        : data.flatMap((row) => {
            const v = field.read(row);
            return (Array.isArray(v) ? v : [v])
              .filter((v) => v !== null && v !== undefined && v !== "")
              .map(String);
          })),
      ...(rule?.values.map(String) ?? []),
    ]),
  ]
    .filter((value) => value.toLowerCase().includes(needle.toLowerCase()))
    .slice(0, 50);
  const setValues = (values: TableFilterRule["values"], immediate = false) =>
    onChange(
      values.length
        ? [
            {
              field: field.key,
              operator: noValue
                ? field.kind === "text"
                  ? "contains"
                  : "is"
                : operator,
              values,
            },
          ]
        : [],
      immediate,
    );
  const setOperator = (next: TableFilterRule["operator"]) => {
    setChosenOperator(next);
    onChange(
      next === "missing" || next === "present"
        ? [{ field: field.key, operator: next, values: [] }]
        : rule?.values.length
          ? [{ ...rule, operator: next }]
          : [],
      true,
    );
  };
  const bounds = rules.find((r) => r.operator === "between");
  const minimum =
    bounds?.values[0] ??
    rules.find((r) => r.operator === "gte" || r.operator === "gt")?.values[0] ??
    (rule?.operator === "is" ? rule.values[0] : undefined);
  const maximum =
    bounds?.values[1] ??
    rules.find((r) => r.operator === "lte" || r.operator === "lt")?.values[0] ??
    (rule?.operator === "is" ? rule.values[0] : undefined);
  const setBound = (position: number, value: string) => {
    const values = [minimum, maximum];
    values[position] =
      value === ""
        ? undefined
        : field.kind === "number"
          ? Number(value)
          : `${value.length === 16 ? `${value}:00` : value}Z`;
    const [min, max] = values;
    onChange(
      min !== undefined && max !== undefined
        ? [{ field: field.key, operator: "between", values: [min, max] }]
        : min !== undefined
          ? [{ field: field.key, operator: "gte", values: [min] }]
          : max !== undefined
            ? [{ field: field.key, operator: "lte", values: [max] }]
            : [],
    );
  };
  return (
    <section
      className="border-b py-4 first:pt-0 last:border-b-0"
      data-filter-field={field.key}
    >
      <div className="mb-2 flex items-center gap-1 px-1">
        <h3 className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
          {field.label}
          {field.unit ? ` (${field.unit})` : ""}
        </h3>
        {rules.length > 0 && (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Clear ${field.label} filter`}
            onClick={() => onChange([], true)}
          >
            <X />
          </Button>
        )}
        {field.kind !== "boolean" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`${field.label} filter options`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!ranged &&
                (field.kind === "text"
                  ? (["contains", "notContains", "is", "isNot"] as const)
                  : (["is", "isNot"] as const)
                ).map((op) => (
                  <DropdownMenuItem key={op} onSelect={() => setOperator(op)}>
                    {labels[op]}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuItem onSelect={() => setOperator("present")}>
                Has a value
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOperator("missing")}>
                Has no value
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {noValue ? (
        <p className="px-1 text-xs">{labels[operator]}</p>
      ) : field.kind === "boolean" ? (
        <Select
          value={rule ? String(rule.values[0]) : "any"}
          onValueChange={(value) =>
            onChange(
              value === "any"
                ? []
                : value === "missing" || value === "present"
                  ? [{ field: field.key, operator: value, values: [] }]
                  : [
                      {
                        field: field.key,
                        operator: "is",
                        values: [value === "true"],
                      },
                    ],
              true,
            )
          }
        >
          <SelectTrigger id={id} aria-label={`${field.label} value`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
            <SelectItem value="missing">Has no value</SelectItem>
            <SelectItem value="present">Has a value</SelectItem>
          </SelectContent>
        </Select>
      ) : ranged ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[minimum, maximum].map((value, position) => (
              <Input
                key={position}
                id={position === 0 ? id : undefined}
                aria-label={`${field.label} ${position === 0 ? "minimum" : "maximum"}`}
                placeholder={position === 0 ? "Min" : "Max"}
                type={field.kind === "date" ? "datetime-local" : "number"}
                step="any"
                value={
                  value === undefined
                    ? ""
                    : field.kind === "date"
                      ? new Date(String(value)).toISOString().slice(0, 19)
                      : String(value)
                }
                onChange={(event) => setBound(position, event.target.value)}
              />
            ))}
          </div>
          {field.kind === "date" && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              UTC date and time
            </p>
          )}
        </>
      ) : field.kind === "enum" ? (
        <>
          {operator === "isNot" && (
            <p className="mb-1 px-1 text-[11px] text-muted-foreground">
              Exclude selected values
            </p>
          )}
          {options.length > 8 || search || !options.length ? (
            <Input
              id={id}
              aria-label={`Search ${field.label} values`}
              placeholder="Search values…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          ) : null}
          {options.length > 1 && options.length <= 30 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="mb-1 ml-2"
              onClick={() =>
                setValues(
                  options.every((value) => rule?.values.includes(value))
                    ? []
                    : options,
                  true,
                )
              }
            >
              {options.every((value) => rule?.values.includes(value))
                ? "Deselect all"
                : "Select all"}
            </Button>
          )}
          <div
            className={
              options.length > 8 ? "max-h-48 overflow-y-auto" : undefined
            }
          >
            {options.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  aria-label={`${field.label}: ${value}`}
                  checked={rule?.values.includes(value) ?? false}
                  onChange={() =>
                    setValues(
                      rule?.values.includes(value)
                        ? rule.values.filter((v) => v !== value)
                        : [...(rule?.values ?? []), value],
                      true,
                    )
                  }
                />
                <span className="truncate">
                  {["status", "feedback", "execution"].includes(field.key)
                    ? value[0]?.toUpperCase() + value.slice(1)
                    : value}
                </span>
              </label>
            ))}
          </div>
          {search && !options.includes(search) && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setValues([...(rule?.values ?? []), search], true);
                setSearch("");
              }}
            >
              Use “{search}”
            </Button>
          )}
        </>
      ) : (
        <>
          <Input
            id={id}
            aria-label={`${field.label} value`}
            placeholder={
              labels[operator] === "Is any of"
                ? "Choose or enter a value…"
                : `${labels[operator] ?? "Contains"}…`
            }
            list={`${id}-values`}
            value={text}
            onFocus={() => setFocused(true)}
            onChange={(event) =>
              setValues(event.target.value ? [event.target.value] : [])
            }
          />
          <datalist id={`${id}-values`}>
            {options.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          {rule &&
            ["is", "isNot"].includes(operator) &&
            rule.values.length > 1 && (
              <p className="mt-1 break-words text-xs">
                {rule.values.slice(1).join(", ")}
              </p>
            )}
        </>
      )}
      {unavailable && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Suggestions unavailable. You can still enter a value.
        </p>
      )}
    </section>
  );
}
