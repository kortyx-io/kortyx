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
import { useRouter, useSearchParams } from "next/navigation";
import { parseAsString } from "nuqs";
import { Fragment, useMemo, useRef } from "react";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
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
  formatDuration,
  numberValue,
} from "@/features/runs/lib/run-event-story";
import { useStudioQueryStates } from "@/lib/nuqs";
import { cn } from "@/lib/utils";

const eventQueryParsers = {
  event: parseAsString.withDefault(""),
};

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
  const detailSurface = useDetailDrawer();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectionPushedRef = useRef(false);
  const [{ event: eventId }, setEventQuery] = useStudioQueryStates(
    eventQueryParsers,
    { shallow: true },
  );
  const selected = items.find((item) => item.event.id === eventId);
  const selectEvent = (selectedEventId: string) => {
    selectionPushedRef.current = detailSurface.presentation !== "none";
    void setEventQuery({ event: selectedEventId });
  };
  const closeEvent = () => {
    const activeTab = searchParams.get("tab") ?? "overview";
    if (
      detailSurface.presentation !== "none" &&
      activeTab === "events" &&
      selectionPushedRef.current
    ) {
      selectionPushedRef.current = false;
      router.back();
      return;
    }
    selectionPushedRef.current = false;
    void setEventQuery({ event: null }, { history: "replace" });
  };

  if (items.length === 0) return <Empty label="No events captured." />;

  const modelEvents = items.filter((item) => item.category === "model").length;
  const failures = items.filter((item) => item.state === "failed").length;
  const interrupts = items.filter(
    (item) => item.category === "interrupt",
  ).length;

  return (
    <div className="h-full min-h-0">
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b bg-muted/10 px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold">
                Chronological event stream
              </h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Every telemetry fact, ordered as it was emitted.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[9px] text-muted-foreground">
              <SummaryBadge>{items.length} events</SummaryBadge>
              {modelEvents > 0 && (
                <SummaryBadge>{modelEvents} model events</SummaryBadge>
              )}
              {interrupts > 0 && (
                <SummaryBadge>{interrupts} interrupt events</SummaryBadge>
              )}
              {failures > 0 && (
                <SummaryBadge className="border-red-500/25 text-red-700 dark:text-red-400">
                  {failures} failed
                </SummaryBadge>
              )}
            </div>
          </div>
        </header>

        <div className="data-table-body-scroll min-h-0 flex-1 overflow-y-auto">
          {items.map((item, index) => {
            const showPhase =
              item.phase !== items[index - 1]?.phase && item.phase !== null;
            return (
              <Fragment key={item.event.id}>
                {showPhase && <PhaseDivider item={item} />}
                <EventRow
                  item={item}
                  last={index === items.length - 1}
                  selected={selected?.event.id === item.event.id}
                  onSelect={() => selectEvent(item.event.id)}
                />
              </Fragment>
            );
          })}
        </div>
      </div>

      <EventDrawer item={selected} onClose={closeEvent} />
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
        +{formatDuration(item.offsetMs)}
      </span>
    </div>
  );
}

function EventRow({
  item,
  last,
  selected,
  onSelect,
}: {
  item: EventStoryItem;
  last: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const appearance = eventAppearance(item);
  const Icon = appearance.icon;

  return (
    <button
      type="button"
      aria-label={`${item.title}. ${item.description}. ${item.stateLabel}. Offset ${formatDuration(item.offsetMs)}`}
      aria-expanded={selected}
      aria-haspopup="dialog"
      onClick={onSelect}
      className={cn(
        "group relative grid w-full grid-cols-[28px_minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/45 md:px-6",
        selected && "bg-muted/60",
      )}
    >
      <span className="relative flex h-full justify-center">
        {!last && (
          <span className="absolute top-5 bottom-[-18px] w-px bg-border" />
        )}
        <span
          className={cn(
            "relative z-[1] flex size-7 items-center justify-center rounded-full border bg-background",
            appearance.border,
          )}
        >
          <Icon className={cn("size-3.5", appearance.iconColor)} />
        </span>
      </span>

      <span
        className="min-w-0"
        style={{ paddingLeft: `${Math.min(item.depth, 4) * 10}px` }}
      >
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
        <time title={new Date(item.event.occurredAt).toLocaleString()}>
          +{formatDuration(item.offsetMs)}
        </time>
        {item.durationMs !== null && (
          <span>{formatDuration(item.durationMs)}</span>
        )}
      </span>
    </button>
  );
}

function EventDrawer({
  item,
  onClose,
}: {
  item: EventStoryItem | undefined;
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
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            This is the individual <code>{item.event.type}</code> telemetry
            fact. Related lifecycle events remain separate so emission order and
            ingest timing stay observable.
          </p>

          <dl className="mt-4 divide-y">
            <KeyValue label="Event type">
              <span className="font-mono">{item.event.type}</span>
            </KeyValue>
            <KeyValue label="Occurred">
              <span className="font-mono">
                {new Date(item.event.occurredAt).toLocaleString()}
              </span>
            </KeyValue>
            <KeyValue label="Run offset">
              <span className="font-mono">
                +{formatDuration(item.offsetMs)}
              </span>
            </KeyValue>
            <KeyValue label="Received">
              <span className="font-mono">
                {new Date(item.event.receivedAt).toLocaleString()}
              </span>
            </KeyValue>
            <KeyValue label="Ingest delay">
              <span className="font-mono">
                {formatDuration(
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
                  {formatDuration(item.durationMs)}
                </span>
              </KeyValue>
            )}
            {item.event.type === "generation.completed" && (
              <GenerationDetails event={item.event} />
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

function GenerationDetails({ event }: { event: StudioDetailEvent }) {
  const usage = asRecord(event.payload.usage);
  const tokens = numberValue(usage.total);
  const ttft = numberValue(event.payload.ttftMs);
  return (
    <>
      <KeyValue label="Provider / model">
        {asString(event.payload.provider) ?? "Unknown"} /{" "}
        {asString(event.payload.model) ?? "Unknown"}
      </KeyValue>
      <KeyValue label="TTFT">
        <span className="font-mono">
          {ttft === null
            ? "Not captured or not applicable"
            : formatDuration(ttft)}
        </span>
      </KeyValue>
      {tokens !== null && (
        <KeyValue label="Tokens">
          <span className="font-mono">{tokens.toLocaleString()}</span>
        </KeyValue>
      )}
      {asString(event.payload.finishReason) && (
        <KeyValue label="Finish reason">
          {asString(event.payload.finishReason)}
        </KeyValue>
      )}
    </>
  );
}

function eventAppearance(item: EventStoryItem): {
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
      item.state === "failed"
        ? CircleAlert
        : item.state === "interrupted"
          ? CirclePause
          : item.state === "completed" || item.state === "resolved"
            ? CheckCircle2
            : category.icon,
    stateBadge:
      item.state === "failed"
        ? "border-red-500/25 bg-red-500/8 text-red-700 dark:text-red-400"
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

function SummaryBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("rounded-full border bg-background px-2 py-1", className)}
    >
      {children}
    </span>
  );
}

function stateTone(
  state: EventState,
): "success" | "danger" | "warning" | "info" | "neutral" {
  if (state === "completed" || state === "resolved") return "success";
  if (state === "failed") return "danger";
  if (state === "cancelled" || state === "expired" || state === "interrupted")
    return "warning";
  if (state === "started") return "info";
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
  span: {
    icon: Activity,
    iconColor: "text-muted-foreground",
    border: "border-border",
    badge: "border-border bg-muted/40 text-muted-foreground",
  },
};
