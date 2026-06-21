import { Input } from "@/components/ui/input";

const ranges = ["Last hour", "24 hours", "7 days", "Custom range"];

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function TimeRangeFilter({
  idPrefix,
  range,
  startedAfter,
  startedBefore,
  onRangeChange,
  onStartedAfterChange,
  onStartedBeforeChange,
}: {
  idPrefix: string;
  range: string;
  startedAfter: string;
  startedBefore: string;
  onRangeChange: (value: string) => void;
  onStartedAfterChange: (value: string) => void;
  onStartedBeforeChange: (value: string) => void;
}) {
  return (
    <>
      <select
        aria-label="Time range"
        value={range}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "Custom range") {
            const now = new Date();
            if (!startedAfter)
              onStartedAfterChange(
                toLocalInputValue(new Date(now.getTime() - 3_600_000)),
              );
            if (!startedBefore) onStartedBeforeChange(toLocalInputValue(now));
          }
          onRangeChange(value);
        }}
        className="mx-2 h-9 w-[calc(100%-1rem)] rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
      >
        {ranges.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
      {range === "Custom range" && (
        <div className="mt-3 space-y-3 px-2">
          <label
            htmlFor={`${idPrefix}-after`}
            className="block text-xs font-medium text-muted-foreground"
          >
            Started after
            <Input
              id={`${idPrefix}-after`}
              type="datetime-local"
              value={startedAfter}
              onChange={(event) => onStartedAfterChange(event.target.value)}
              className="mt-1.5"
            />
          </label>
          <label
            htmlFor={`${idPrefix}-before`}
            className="block text-xs font-medium text-muted-foreground"
          >
            Started before
            <Input
              id={`${idPrefix}-before`}
              type="datetime-local"
              value={startedBefore}
              onChange={(event) => onStartedBeforeChange(event.target.value)}
              className="mt-1.5"
            />
          </label>
        </div>
      )}
    </>
  );
}
