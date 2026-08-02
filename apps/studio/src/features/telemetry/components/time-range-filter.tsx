"use client";

import {
  STUDIO_TIME_RANGES,
  type StudioTimeRange,
} from "@kortyx/telemetry-contracts";
import { format } from "date-fns";
import { CalendarDays, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type DateRange, TZDate } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type TimeRangeValue = {
  range: StudioTimeRange;
  startedAfter: string;
  startedBefore: string;
};

const dayStartUtc = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
const dayEndUtc = (date: Date) =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
const validDate = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
};
const formatUtcDate = (date: Date) =>
  format(new TZDate(date, "UTC"), "MMM d, yyyy");

export function TimeRangeFilter({
  range,
  startedAfter,
  startedBefore,
  onChange,
  compact = false,
}: {
  idPrefix?: string;
  range: StudioTimeRange;
  startedAfter: string;
  startedBefore: string;
  onChange: (value: TimeRangeValue) => void;
  compact?: boolean;
}) {
  const selected = useMemo<DateRange | undefined>(() => {
    if (range !== "Custom range") return undefined;
    const from = validDate(startedAfter);
    const to = validDate(startedBefore);
    return from ? { from, to } : undefined;
  }, [range, startedAfter, startedBefore]);
  const [draft, setDraft] = useState<DateRange | undefined>(selected);
  const [open, setOpen] = useState(false);

  useEffect(() => setDraft(selected), [selected]);

  const customLabel =
    selected?.from && selected.to
      ? `${formatUtcDate(selected.from)} – ${formatUtcDate(selected.to)}`
      : "Choose UTC dates";

  return (
    <div className={cn("space-y-2", !compact && "px-2")}>
      <div className={cn("flex gap-2", !compact && "flex-col")}>
        <select
          aria-label="Time range"
          value={open ? "Custom range" : range}
          onChange={(event) => {
            const nextRange = event.target.value as StudioTimeRange;
            if (nextRange === "Custom range") {
              const now = new Date();
              const nextDraft =
                selected ??
                ({
                  from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000),
                  to: now,
                } satisfies DateRange);
              setDraft(nextDraft);
              setOpen(true);
              return;
            }
            setOpen(false);
            onChange({
              range: nextRange,
              startedAfter: "",
              startedBefore: "",
            });
          }}
          className={cn(
            "h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50",
            compact ? "w-[128px]" : "w-full",
          )}
        >
          {STUDIO_TIME_RANGES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        {(range === "Custom range" || open) && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size={compact ? "sm" : "default"}
                className={cn(
                  "justify-between font-normal",
                  compact ? "max-w-[220px]" : "w-full",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <CalendarDays className="shrink-0" />
                  <span className="truncate">{customLabel}</span>
                </span>
                <ChevronDown className="shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-3">
              <Calendar
                mode="range"
                selected={draft}
                onSelect={setDraft}
                defaultMonth={draft?.from}
                disabled={{ after: new Date() }}
                numberOfMonths={1}
              />
              <div className="mt-3 flex items-center justify-between gap-4 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Full days in UTC
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={!draft?.from || !draft.to}
                  onClick={() => {
                    if (!draft?.from || !draft.to) return;
                    onChange({
                      range: "Custom range",
                      startedAfter: dayStartUtc(draft.from).toISOString(),
                      startedBefore: dayEndUtc(draft.to).toISOString(),
                    });
                    setOpen(false);
                  }}
                >
                  Apply range
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {range === "Custom range" && (
        <p className="text-[11px] text-muted-foreground">
          {customLabel}. Dates are stored and evaluated in UTC.
        </p>
      )}
    </div>
  );
}
