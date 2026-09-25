"use client";

import type { StudioDetailEvent } from "@kortyx/telemetry-contracts";
import {
  Activity,
  Bot,
  Braces,
  CheckCircle2,
  CircleAlert,
  CirclePause,
  Database,
  GitBranch,
  type LucideIcon,
  Play,
  Wrench,
} from "lucide-react";
import { parseAsString } from "nuqs";
import { Fragment, useMemo, useState } from "react";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { KeyValue, StatusPill } from "@/components/detail/detail-primitives";
import { PayloadViewer } from "@/components/detail/payload-viewer";
import { OverflowText } from "@/components/ui/overflow-tooltip";
import {
  asRecord,
  asString,
  buildEventStory,
  type EventCategory,
  type EventState,
  type EventStoryItem,
  numberValue,
} from "@/features/runs/lib/run-event-story";
import { matchesSearchText } from "@/features/runs/lib/search-text";
import { formatCount, formatDateTime, formatDurationMs } from "@/lib/format";
import { useStudioQueryStates } from "@/lib/nuqs";
import { cn } from "@/lib/utils";

const eventQueryParsers = {
  event: parseAsString.withDefault(""),
};
const DEPTH_GUIDES = ["one", "two", "three", "four", "five"];
const FAILURE_STATES = new Set(["failed", "fault", "error"]);

export function RunEvents({
  events,
  startedAt,
}: {
  events: StudioDetailEvent[];
  startedAt: string;
}) {
  const items = useMemo(
    () => buildEventStory(events, startedAt),
    [events, startedAt],
  );
  const [{ event: eventId }, setEventQuery] = useStudioQueryStates(
    eventQueryParsers,
    { shallow: true },
  );
  const selected = items.find((item) => item.event.id === eventId);
  const selectedModelStart = selected?.event.spanId
    ? events.find(
        (event) =>
          event.type === "span.started" &&
          event.payload.name === "runReasonEngine" &&
          event.spanId === selected.event.spanId,
      )
    : undefined;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [state, setState] = useState("all");
  const visibleItems = useMemo(() => {
    return items.filter(
      (item) =>
        (category === "all" || item.category === category) &&
        (state === "all" ||
          (state === "errors"
            ? FAILURE_STATES.has(item.state)
            : item.state === state)) &&
        matchesSearchText(search, [
          item.title,
          item.description,
          item.event.type,
          item.event.nodeId,
          item.event.workflowId,
        ]),
    );
  }, [items, search, category, state]);
  const selectEvent = (selectedEventId: string) => {
    void setEventQuery({ event: selectedEventId });
  };
  const closeEvent = () => {
    void setEventQuery({ event: null });
  };

  if (items.length === 0) return <Empty label="No events captured." />;

  return (
    <div className="h-full min-h-0">
      <div className="flex h-full min-h-0 flex-col">
        <header className="@container shrink-0 border-b bg-muted/10 px-3 py-1.5">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 @3xl:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
            <h3 className="whitespace-nowrap text-xs font-semibold @3xl:mr-2">
              Events
              <output className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                {visibleItems.length === items.length
                  ? items.length
                  : `${visibleItems.length}/${items.length}`}
              </output>
            </h3>
            <input
              aria-label="Search events"
              type="search"
              placeholder="Search events…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="col-span-2 h-7 min-w-0 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring @3xl:col-span-1"
            />
            <select
              aria-label="Filter event category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-7 w-full rounded-md border bg-background px-1.5 text-xs @3xl:w-28"
            >
              <option value="all">All categories</option>
              {[...new Set(items.map((item) => item.category))].map((value) => (
                <option key={value} value={value}>
                  {items.find((item) => item.category === value)?.categoryLabel}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter event status"
              value={state}
              onChange={(event) => setState(event.target.value)}
              className="h-7 w-full rounded-md border bg-background px-1.5 text-xs @3xl:w-36"
            >
              <option value="all">All statuses</option>
              <option value="errors">Errors &amp; failures</option>
              {[...new Set(items.map((item) => item.state))].map((value) => (
                <option key={value} value={value}>
                  {items.find((item) => item.state === value)?.stateLabel}
                </option>
              ))}
            </select>
          </div>
        </header>

        <div className="data-table-body-scroll min-h-0 flex-1 overflow-y-auto">
          {visibleItems.length === 0 && (
            <Empty label="No events match these filters." />
          )}
          {visibleItems.map((item, index) => {
            const showPhase =
              item.phase !== visibleItems[index - 1]?.phase &&
              item.phase !== null;
            return (
              <Fragment key={item.event.id}>
                {showPhase && <PhaseDivider item={item} />}
                <EventRow
                  item={item}
                  selected={selected?.event.id === item.event.id}
                  onSelect={() => selectEvent(item.event.id)}
                />
              </Fragment>
            );
          })}
        </div>
      </div>

      <EventDrawer
        item={selected}
        modelStart={selectedModelStart}
        onClose={closeEvent}
      />
    </div>
  );
}

function PhaseDivider({ item }: { item: EventStoryItem }) {
  const phase = item.phase ?? 1;
  return (
    <div className="sticky top-0 z-[2] flex items-center justify-between border-y bg-background/95 px-4 py-2 text-[10px] backdrop-blur md:px-6">
      <span className="font-medium">
        {phase === 1 ? "Initial execution" : `Resumed execution ${phase - 1}`}
      </span>
      <span className="font-mono tabular-nums text-muted-foreground">
        +{formatDurationMs(item.offsetMs)}
      </span>
    </div>
  );
}

function EventRow({
  item,
  selected,
  onSelect,
}: {
  item: EventStoryItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const appearance = eventAppearance(item);
  const depth = Math.min(item.depth, 5);

  return (
    <button
      type="button"
      aria-label={`${item.title}. ${item.description}. ${item.stateLabel}. Offset ${formatDurationMs(item.offsetMs)}`}
      aria-expanded={selected}
      aria-haspopup="dialog"
      onClick={onSelect}
      className={cn(
        "group relative grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/45 md:px-6",
        selected && "bg-muted/60",
      )}
    >
      <span
        className="relative min-w-0"
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
      >
        {DEPTH_GUIDES.slice(0, depth).map((guide, level) => (
          <span
            key={guide}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-[-12px] border-l border-border/80"
            style={{ left: `${level * 14 + 5}px` }}
          />
        ))}
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <OverflowText
            ariaLabel={item.title}
            className="max-w-full text-xs font-medium"
          >
            {item.title}
          </OverflowText>
          <EventBadge className={appearance.badge}>
            {item.categoryLabel}
          </EventBadge>
          <EventBadge className={appearance.stateBadge}>
            {item.stateLabel}
          </EventBadge>
        </span>
        <OverflowText
          ariaLabel={item.description}
          className="mt-1 text-[10px] text-muted-foreground"
        >
          {item.description}
        </OverflowText>
      </span>

      <span className="flex min-w-16 flex-col items-end gap-1 pt-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">
        <time title={formatDateTime(item.event.occurredAt)}>
          +{formatDurationMs(item.offsetMs)}
        </time>
        {item.durationMs !== null && (
          <span>{formatDurationMs(item.durationMs)}</span>
        )}
      </span>
    </button>
  );
}

function EventDrawer({
  item,
  modelStart,
  onClose,
}: {
  item: EventStoryItem | undefined;
  modelStart: StudioDetailEvent | undefined;
  onClose: () => void;
}) {
  return (
    <DetailInspectorDrawer
      open={Boolean(item)}
      onClose={onClose}
      title={item?.title ?? "Event"}
      description={item?.description ?? "Inspect telemetry event"}
      closeLabel="Close event details"
      bodyClassName="p-5 md:p-6"
      badges={
        item ? (
          <>
            <EventBadge className={eventAppearance(item).badge}>
              {item.categoryLabel}
            </EventBadge>
            <StatusPill tone={stateTone(item.state)}>
              {item.stateLabel}
            </StatusPill>
          </>
        ) : undefined
      }
    >
      {item && (
        <>
          <dl className="divide-y">
            <KeyValue label="Event type">
              <span className="font-mono">{item.event.type}</span>
            </KeyValue>
            <KeyValue label="Occurred">
              <span className="font-mono">
                {formatDateTime(item.event.occurredAt)}
              </span>
            </KeyValue>
            <KeyValue label="Run offset">
              <span className="font-mono">
                +{formatDurationMs(item.offsetMs)}
              </span>
            </KeyValue>
            <KeyValue label="Received">
              <span className="font-mono">
                {formatDateTime(item.event.receivedAt)}
              </span>
            </KeyValue>
            <KeyValue label="Ingest delay">
              <span className="font-mono">
                {formatDurationMs(
                  Math.max(
                    0,
                    Date.parse(item.event.receivedAt) -
                      Date.parse(item.event.occurredAt),
                  ),
                )}
              </span>
            </KeyValue>
            {item.durationMs !== null && (
              <KeyValue label="Duration">
                <span className="font-mono">
                  {formatDurationMs(item.durationMs)}
                </span>
              </KeyValue>
            )}
            {item.event.type === "generation.completed" && (
              <GenerationDetails event={item.event} modelStart={modelStart} />
            )}
            <KeyValue label="Workflow">{item.event.workflowId}</KeyValue>
            <KeyValue label="Node">
              {item.event.nodeId ?? "Not captured"}
            </KeyValue>
            <KeyValue label="Service">
              {item.event.serviceName}
              {item.event.deploymentRef ? ` · ${item.event.deploymentRef}` : ""}
            </KeyValue>
            <KeyValue label="Event ID">
              <span className="break-all font-mono">{item.event.id}</span>
            </KeyValue>
            <KeyValue label="Trace">
              <span className="break-all font-mono">
                {item.event.traceId ?? "Not captured"}
              </span>
            </KeyValue>
            <KeyValue label="Span">
              <span className="break-all font-mono">
                {item.event.spanId ?? "Not captured"}
              </span>
            </KeyValue>
            <KeyValue label="Parent span">
              <span className="break-all font-mono">
                {item.event.parentSpanId ?? "Root"}
              </span>
            </KeyValue>
            {item.event.tags.length > 0 && (
              <KeyValue label="Tags">{item.event.tags.join(", ")}</KeyValue>
            )}
          </dl>

          <h4 className="mb-2 mt-5 text-xs font-medium">Payload</h4>
          <PayloadViewer value={item.event.payload} />
          {item.event.metadata && (
            <>
              <h4 className="mb-2 mt-5 text-xs font-medium">Metadata</h4>
              <PayloadViewer value={item.event.metadata} />
            </>
          )}
        </>
      )}
    </DetailInspectorDrawer>
  );
}

function GenerationDetails({
  event,
  modelStart,
}: {
  event: StudioDetailEvent;
  modelStart: StudioDetailEvent | undefined;
}) {
  const usage = asRecord(event.payload.usage);
  const metadata = asRecord(event.payload.providerMetadata);
  const reasoning = asRecord(metadata.reasoning);
  const finish =
    asString(event.payload.finishReason) ??
    asString(asRecord(event.payload.finishReason).unified);
  const tokens = numberValue(usage.total);
  const ttft = numberValue(event.payload.ttftMs);
  const linked = asRecord(modelStart?.payload.attributes);
  return (
    <>
      <KeyValue label="Provider / model">
        {asString(event.payload.provider) ??
          asString(linked.providerId) ??
          "Unknown"}{" "}
        /{" "}
        {asString(event.payload.model) ?? asString(linked.modelId) ?? "Unknown"}
      </KeyValue>
      {asString(metadata.api) && (
        <KeyValue label="API">{asString(metadata.api)}</KeyValue>
      )}
      {asString(reasoning.effort) && (
        <KeyValue label="Reasoning effort">
          {asString(reasoning.effort)}
        </KeyValue>
      )}
      {asString(metadata.status) && (
        <KeyValue label="Response status">{asString(metadata.status)}</KeyValue>
      )}
      {(
        [
          ["Input tokens", "input"],
          ["Output tokens", "output"],
          ["Reasoning tokens", "reasoning"],
          ["Cached input tokens", "cacheRead"],
        ] as const
      ).map(([label, key]) => {
        const count = numberValue(usage[key]);
        return count === null ? null : (
          <KeyValue key={key} label={label}>
            {formatCount(count, { compact: false })}
          </KeyValue>
        );
      })}
      <KeyValue label="TTFT">
        <span className="font-mono">
          {ttft === null
            ? asRecord(event.payload.finishReason).unified === "tool-calls"
              ? "No text (tool call)"
              : "No text observed or non-streaming"
            : formatDurationMs(ttft)}
        </span>
      </KeyValue>
      {tokens !== null && (
        <KeyValue label="Tokens">
          <span className="font-mono">
            {formatCount(tokens, { compact: false })}
          </span>
        </KeyValue>
      )}
      {finish && <KeyValue label="Finish reason">{finish}</KeyValue>}
    </>
  );
}

function eventAppearance(item: Pick<EventStoryItem, "category" | "state">): {
  icon: LucideIcon;
  iconColor: string;
  border: string;
  badge: string;
  stateBadge: string;
} {
  const category = CATEGORY_APPEARANCE[item.category];
  return {
    ...category,
    icon:
      item.state === "failed" || item.state === "error"
        ? CircleAlert
        : item.state === "interrupted"
          ? CirclePause
          : item.state === "completed" || item.state === "resolved"
            ? CheckCircle2
            : category.icon,
    stateBadge:
      item.state === "failed" || item.state === "error"
        ? "border-red-500/25 bg-red-500/8 text-red-700 dark:text-red-400"
        : item.state === "warning"
          ? "border-amber-500/25 bg-amber-500/8 text-amber-700 dark:text-amber-400"
          : item.state === "interrupted"
            ? "border-amber-500/25 bg-amber-500/8 text-amber-700 dark:text-amber-400"
            : item.state === "started"
              ? "border-blue-500/20 bg-blue-500/8 text-blue-700 dark:text-blue-400"
              : item.state === "completed" || item.state === "resolved"
                ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400"
                : item.state === "cancelled" || item.state === "expired"
                  ? "border-amber-500/20 bg-amber-500/8 text-amber-700 dark:text-amber-400"
                  : "border-border bg-muted/40 text-muted-foreground",
  };
}

function EventBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[8px] font-medium leading-none",
        className,
      )}
    >
      {children}
    </span>
  );
}

function stateTone(
  state: EventState,
): "success" | "danger" | "warning" | "info" | "neutral" {
  if (state === "completed" || state === "resolved") return "success";
  if (state === "failed" || state === "fault" || state === "error")
    return "danger";
  if (
    state === "denied" ||
    state === "waiting" ||
    state === "cancelled" ||
    state === "expired" ||
    state === "interrupted" ||
    state === "warning"
  )
    return "warning";
  if (state === "started" || state === "replayed") return "info";
  return "neutral";
}

function Empty({ label }: { label: string }) {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">{label}</div>
  );
}

const CATEGORY_APPEARANCE: Record<
  EventCategory,
  {
    icon: LucideIcon;
    iconColor: string;
    border: string;
    badge: string;
  }
> = {
  run: {
    icon: Play,
    iconColor: "text-indigo-600 dark:text-indigo-400",
    border: "border-indigo-500/25",
    badge:
      "border-indigo-500/20 bg-indigo-500/8 text-indigo-700 dark:text-indigo-400",
  },
  node: {
    icon: Braces,
    iconColor: "text-sky-600 dark:text-sky-400",
    border: "border-sky-500/25",
    badge: "border-sky-500/20 bg-sky-500/8 text-sky-700 dark:text-sky-400",
  },
  model: {
    icon: Bot,
    iconColor: "text-violet-600 dark:text-violet-400",
    border: "border-violet-500/25",
    badge:
      "border-violet-500/20 bg-violet-500/8 text-violet-700 dark:text-violet-400",
  },
  tool: {
    icon: Wrench,
    iconColor: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/25",
    badge: "border-blue-500/20 bg-blue-500/8 text-blue-700 dark:text-blue-400",
  },
  interrupt: {
    icon: CirclePause,
    iconColor: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/25",
    badge:
      "border-amber-500/20 bg-amber-500/8 text-amber-700 dark:text-amber-400",
  },
  session: {
    icon: Database,
    iconColor: "text-teal-600 dark:text-teal-400",
    border: "border-teal-500/25",
    badge: "border-teal-500/20 bg-teal-500/8 text-teal-700 dark:text-teal-400",
  },
  workflow: {
    icon: GitBranch,
    iconColor: "text-cyan-600 dark:text-cyan-400",
    border: "border-cyan-500/25",
    badge: "border-cyan-500/20 bg-cyan-500/8 text-cyan-700 dark:text-cyan-400",
  },
  error: {
    icon: CircleAlert,
    iconColor: "text-red-600 dark:text-red-400",
    border: "border-red-500/25",
    badge: "border-red-500/20 bg-red-500/8 text-red-700 dark:text-red-400",
  },
  span: {
    icon: Activity,
    iconColor: "text-muted-foreground",
    border: "border-border",
    badge: "border-border bg-muted/40 text-muted-foreground",
  },
};
