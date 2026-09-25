"use client";

import type { StudioDetailEvent } from "@kortyx/telemetry-contracts";
import { useMemo, useState } from "react";
import { PayloadViewer } from "@/components/detail/payload-viewer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildModelExchanges,
  buildModelOperationEntries,
  buildModelOperations,
  type ModelOperation,
} from "@/features/runs/lib/run-model-io";
import { matchesSearchText } from "@/features/runs/lib/search-text";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const formatLabels = {
  structured: "Structured",
  "text-delta": "Text delta",
  text: "Text",
  "tool-calls": "Tool calls",
  unknown: "Unknown",
};

export function RunModelIO({ events }: { events: StudioDetailEvent[] }) {
  const exchanges = useMemo(() => buildModelExchanges(events), [events]);
  const operations = useMemo(
    () => buildModelOperations(events, exchanges),
    [events, exchanges],
  );
  const [search, setSearch] = useState("");
  const [emitted, setEmitted] = useState("all");
  const [streamed, setStreamed] = useState("all");
  const [format, setFormat] = useState("all");
  // A filter selects a whole operation so its request, response, and tool
  // context stay together even when only one model pass matches.
  const visibleOperations = operations.filter((operation) =>
    operation.attempts.some(
      (item) =>
        (emitted === "all" || String(item.emitted) === emitted) &&
        (streamed === "all" || String(item.streamed) === streamed) &&
        (format === "all" || item.format === format) &&
        matchesSearchText(search, [
          item.model,
          item.provider,
          item.reasonId,
          item.nodeId,
          item.workflowId,
        ]),
    ),
  );

  return (
    <div className="@container min-w-0">
      <div className="border-b bg-muted/10 p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Model inputs and outputs</h3>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {visibleOperations.length === operations.length
              ? operations.length
              : `${visibleOperations.length}/${operations.length}`}{" "}
            {operations.length === 1 ? "operation" : "operations"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 @2xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <input
            type="search"
            aria-label="Search model calls"
            placeholder="Search model or node…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="col-span-2 h-8 min-w-0 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring @2xl:col-span-1"
          />
          <Select value={emitted} onValueChange={setEmitted}>
            <SelectTrigger
              size="sm"
              aria-label="Filter direct model text emission"
              className="min-w-0 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any model text</SelectItem>
              <SelectItem value="true">Model text forwarded</SelectItem>
              <SelectItem value="false">Model text held</SelectItem>
              <SelectItem value="null">Model text unknown</SelectItem>
            </SelectContent>
          </Select>
          <Select value={streamed} onValueChange={setStreamed}>
            <SelectTrigger
              size="sm"
              aria-label="Filter model streaming"
              className="min-w-0 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any provider mode</SelectItem>
              <SelectItem value="true">Provider streamed</SelectItem>
              <SelectItem value="false">Provider buffered</SelectItem>
              <SelectItem value="null">Provider mode unknown</SelectItem>
            </SelectContent>
          </Select>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger
              size="sm"
              aria-label="Filter output format"
              className="col-span-2 min-w-0 text-xs @2xl:col-span-1"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any output</SelectItem>
              <SelectItem value="structured">Structured</SelectItem>
              <SelectItem value="text-delta">Text delta</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="tool-calls">Tool calls</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          Model text reflects useReason({"{ emit }"}). Activity, tool events,
          and final messages can reach the UI separately.
        </p>
      </div>

      {exchanges.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          No model calls were captured for this run.
        </p>
      ) : visibleOperations.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          No model operations match these filters.
        </p>
      ) : (
        <div className="space-y-2 p-3">
          {visibleOperations.map((operation, index) => (
            <ModelOperationCard
              key={operation.id}
              operation={operation}
              initialOpen={index === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelOperationCard({
  operation,
  initialOpen,
}: {
  operation: ModelOperation;
  initialOpen: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const first = operation.attempts[0];
  const last = operation.attempts.at(-1);
  const entries = buildModelOperationEntries(operation);
  return (
    <details
      className="group min-w-0 overflow-hidden rounded-lg border bg-background"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1.5 px-3 py-2 text-xs hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
        <span className="mr-0.5 text-muted-foreground transition-transform group-open:rotate-90">
          ▶
        </span>
        <strong className="text-sm">{operation.model}</strong>
        {operation.reasonId && (
          <span className="text-muted-foreground">{operation.reasonId}</span>
        )}
        <span className="text-muted-foreground">
          {operation.nodeId ?? operation.workflowId}
        </span>
        {last && <Tag>{formatLabels[last.format]}</Tag>}
        {last && (
          <Tag>
            {last.streamed === null
              ? "Stream unknown"
              : last.streamed
                ? "Streamed"
                : "Buffered"}
          </Tag>
        )}
        {last && (
          <Tag>
            {last.emitted === null
              ? "Model text unknown"
              : last.emitted
                ? "Model text forwarded"
                : "Model text held"}
          </Tag>
        )}
        {operation.interruptCount > 0 && (
          <Tag>
            {operation.interruptCount} human{" "}
            {operation.interruptCount === 1 ? "input" : "inputs"}
          </Tag>
        )}
        {last && last.status !== "completed" && (
          <Tag danger={last.status === "failed"}>
            {last.status === "incomplete"
              ? "Completion not captured"
              : last.status}
          </Tag>
        )}
      </summary>
      <div className="border-t px-3 py-2 text-xs text-muted-foreground">
        {first?.provider} · {first && formatDateTime(first.occurredAt)} ·{" "}
        {operation.workflowId}
        {operation.attempts.length > 1 && (
          <span> · {operation.attempts.length} model passes combined</span>
        )}
        {operation.interruptCount > operation.explicitInterruptCount && (
          <p className="mt-1">
            Interrupt lifecycle telemetry was missing for this run. The request
            and response below come from the resumed model input.
          </p>
        )}
      </div>
      <div className="space-y-3 border-t p-3">
        {entries.map((entry) =>
          entry.kind === "payload" ? (
            <section key={entry.id} className="min-w-0">
              <h4 className="mb-1.5 text-xs font-semibold">{entry.title}</h4>
              <PayloadViewer
                value={entry.value}
                defaultClean={false}
                expandAll
              />
            </section>
          ) : (
            <div
              key={entry.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-l-2 border-border py-1 pl-3 text-xs text-muted-foreground"
            >
              <span
                className={cn(
                  entry.status === "failed" && "text-red-700 dark:text-red-400",
                )}
              >
                {entry.label}
              </span>
              {entry.occurredAt && (
                <time className="font-mono text-[10px]">
                  {formatDateTime(entry.occurredAt)}
                </time>
              )}
            </div>
          ),
        )}
      </div>
    </details>
  );
}

function Tag({
  children,
  danger = false,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground",
        danger &&
          "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
      )}
    >
      {children}
    </span>
  );
}
