"use client";

import type { StudioDetailEvent } from "@kortyx/telemetry-contracts";
import {
  Bot,
  Braces,
  CheckCircle2,
  CircleAlert,
  CirclePause,
  Database,
  GitBranch,
  type LucideIcon,
  Play,
  RotateCcw,
  TimerReset,
  Wrench,
} from "lucide-react";
import { parseAsString } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { KeyValue, StatusPill } from "@/components/detail/detail-primitives";
import { PayloadViewer } from "@/components/detail/payload-viewer";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { OverflowText } from "@/components/ui/overflow-tooltip";
import {
  buildTimelineScale,
  buildTraceStory,
  isControlFlowInterrupt,
  isPointEvent,
  statusLabel,
  type TimelineScale,
  type TraceItem,
  type TraceKind,
  type TraceStatus,
} from "@/features/runs/lib/run-trace-story";
import { formatDateTime, formatDurationMs } from "@/lib/format";
import { useStudioQueryStates } from "@/lib/nuqs";
import { cn } from "@/lib/utils";

export { isControlFlowInterrupt } from "@/features/runs/lib/run-trace-story";

const traceQueryParsers = {
  trace: parseAsString.withDefault(""),
};

export function RunTrace({
  events,
  startedAt,
  focusFailure,
}: {
  events: StudioDetailEvent[];
  startedAt: string;
  focusFailure: boolean;
}) {
  const items = useMemo(() => buildTraceStory(events), [events]);
  const scale = useMemo(
    () => buildTimelineScale(events, startedAt),
    [events, startedAt],
  );
  const [{ trace: traceId }, setTraceQuery] = useStudioQueryStates(
    traceQueryParsers,
    { shallow: true },
  );
  const [autoFocusId, setAutoFocusId] = useState(
    (focusFailure
      ? [...items].reverse().find((item) => item.status === "failed")?.id
      : undefined) ?? undefined,
  );
  const autoFocusSyncedRef = useRef(false);
  const selectedId = traceId || autoFocusId;
  const selected = items.find((item) => item.id === selectedId);

  useEffect(() => {
    if (autoFocusSyncedRef.current) return;
    autoFocusSyncedRef.current = true;
    if (autoFocusId && !traceId) {
      void setTraceQuery({ trace: autoFocusId }, { history: "replace" });
    }
  }, [autoFocusId, setTraceQuery, traceId]);

  const selectItem = (itemId: string) => {
    setAutoFocusId(undefined);
    void setTraceQuery({ trace: itemId });
  };
  const closeItem = () => {
    setAutoFocusId(undefined);
    void setTraceQuery({ trace: null });
  };

  if (items.length === 0)
    return <Empty label="No telemetry events were captured for this run." />;

  const resumptions = items.filter(
    (item) => item.kind === "execution" && item.executionRole === "resumed",
  ).length;
  const nodes = items.filter((item) => item.kind === "node").length;
  const modelCalls = items.filter((item) => item.kind === "generation").length;
  const interrupts = items.filter((item) => item.kind === "interrupt").length;

  return (
    <div className="h-full min-h-0">
      <div className="@container h-full min-h-0">
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b">
            <div className="grid grid-cols-[minmax(0,1fr)_76px] items-center gap-3 px-4 pt-3 pb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground @2xl:grid-cols-[minmax(240px,0.8fr)_minmax(220px,1fr)_76px]">
              <span>Execution story</span>
              <span className="hidden items-center gap-1 @2xl:flex">
                Execution timeline
                {scale.gaps.length > 0 && (
                  <>
                    <span className="normal-case tracking-normal text-amber-600 dark:text-amber-400">
                      · waits compressed
                    </span>
                    <InfoTooltip
                      label="Explain compressed waits"
                      className="normal-case tracking-normal"
                    >
                      Quiet periods longer than five seconds are shortened only
                      on the visual axis. Their real wall-clock duration remains
                      visible in the story and inspector.
                    </InfoTooltip>
                  </>
                )}
              </span>
              <span className="text-right">Timing</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-[9px] text-muted-foreground">
              <span>
                {nodes} node{nodes === 1 ? "" : "s"} · {modelCalls} model call
                {modelCalls === 1 ? "" : "s"} · {interrupts} interrupt
                {interrupts === 1 ? "" : "s"}
                {resumptions > 0 && (
                  <>
                    {" "}
                    · {resumptions} resumption
                    {resumptions === 1 ? "" : "s"}
                  </>
                )}
              </span>
              {modelCalls > 0 && (
                <span className="hidden items-center gap-2.5 @3xl:flex">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    TTFT
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-violet-500" />
                    output stream
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-slate-400" />
                    finalize
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-muted-foreground/55" />
                    unclassified
                  </span>
                  <InfoTooltip label="Explain model timing colors">
                    TTFT is time before the first observed text chunk. Output
                    stream is the first-to-last observed chunk window.
                    Finalization is the remaining provider completion time.
                    Unclassified means the call was non-streaming or predates
                    timing capture.
                  </InfoTooltip>
                </span>
              )}
              <span className="hidden font-mono tabular-nums @2xl:inline">
                {formatDurationMs(scale.wallDurationMs)} wall ·{" "}
                {formatDurationMs(scale.visibleDurationMs)} visible
              </span>
            </div>
          </div>

          <div className="data-table-body-scroll min-h-0 flex-1 overflow-y-auto p-2">
            {items.map((item) => (
              <TraceRow
                key={item.id}
                item={item}
                selected={selected?.id === item.id}
                scale={scale}
                onSelect={() => selectItem(item.id)}
              />
            ))}
          </div>
        </div>
      </div>
      <TraceItemDrawer item={selected} onClose={closeItem} />
    </div>
  );
}

function TraceRow({
  item,
  selected,
  scale,
  onSelect,
}: {
  item: TraceItem;
  selected: boolean;
  scale: TimelineScale;
  onSelect: () => void;
}) {
  const appearance = kindAppearance(item.kind, item.status, item.executionRole);
  const Icon = appearance.icon;
  const startedMs = Date.parse(item.startedAt);
  const left = scale.toPercent(startedMs);
  const end =
    item.durationMs === null
      ? startedMs
      : Math.min(scale.endMs, startedMs + item.durationMs);
  const width = Math.max(0, scale.toPercent(end) - left);
  const instant = item.durationMs === null || item.durationMs <= 0;
  const generationTiming = item.kind === "generation" ? item.timing : undefined;
  const pointEvent = isPointEvent(item);
  const offsetMs = Math.max(0, startedMs - scale.startMs);
  const durationLabel =
    item.durationMs === null
      ? pointEvent
        ? `Occurred at ${formatDurationMs(offsetMs)} into the run`
        : "Duration not captured"
      : `Duration ${formatDurationMs(item.durationMs)}`;

  return (
    <button
      type="button"
      aria-label={`${item.label}. ${item.description}. ${statusLabel(item.status)}. ${durationLabel}`}
      aria-expanded={selected}
      aria-haspopup="dialog"
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_76px] items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/70 @2xl:grid-cols-[minmax(240px,0.8fr)_minmax(220px,1fr)_76px]",
        selected && "bg-muted",
        item.kind === "execution" && "mt-1 border bg-muted/35",
      )}
    >
      <span
        className="flex min-w-0 items-start gap-2"
        style={{ paddingLeft: `${Math.min(item.depth, 4) * 14}px` }}
      >
        <span
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md",
            appearance.iconBackground,
          )}
        >
          <Icon className={cn("size-3", appearance.iconColor)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <OverflowText
              ariaLabel={item.label}
              className={cn(
                "flex-1 text-xs font-medium",
                item.status === "failed" && "text-red-700 dark:text-red-400",
                (item.status === "interrupted" || item.status === "waiting") &&
                  "text-amber-700 dark:text-amber-400",
              )}
            >
              {item.label}
            </OverflowText>
            {item.modelCalls > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[9px] text-violet-700 dark:text-violet-400">
                <Bot className="size-2.5" />
                {item.modelCalls}
              </span>
            )}
          </span>
          <OverflowText
            ariaLabel={item.description}
            className="mt-0.5 text-[9px] text-muted-foreground"
          >
            {item.description}
          </OverflowText>
        </span>
      </span>

      <span className="relative hidden h-7 overflow-hidden rounded bg-muted/45 @2xl:block">
        {scale.gaps.map((gap) => (
          <span
            key={gap.startMs}
            aria-hidden="true"
            title={`${formatDurationMs(gap.actualDurationMs)} without telemetry; compressed on this axis`}
            className="absolute inset-y-0 border-x border-dashed border-amber-500/35 bg-amber-500/8"
            style={{
              left: `${scale.toPercent(gap.startMs)}%`,
              width: `${Math.max(0.8, scale.toPercent(gap.endMs) - scale.toPercent(gap.startMs))}%`,
            }}
          />
        ))}
        {generationTiming &&
        generationTiming.ttftMs !== null &&
        item.durationMs ? (
          <span
            role="img"
            aria-label={`Waiting for first token ${formatDurationMs(generationTiming.ttftMs)}, first to last output chunk ${formatDurationMs(generationTiming.streamDurationMs ?? 0)}, finalizing response ${formatDurationMs(generationTiming.postStreamDurationMs ?? 0)}`}
            className="absolute top-1/2 flex h-2 -translate-y-1/2 overflow-hidden rounded-full"
            style={{
              left: `${left}%`,
              width: `max(3px, ${Math.min(width, 100 - left)}%)`,
            }}
          >
            <span
              aria-hidden="true"
              title={`Waiting for first token: ${formatDurationMs(generationTiming.ttftMs)}`}
              className="h-full bg-amber-500"
              style={{
                width: `${percentOf(generationTiming.ttftMs, item.durationMs)}%`,
              }}
            />
            <span
              aria-hidden="true"
              title={`First to last output chunk: ${formatDurationMs(generationTiming.streamDurationMs ?? 0)}`}
              className="h-full bg-violet-500"
              style={{
                width: `${percentOf(generationTiming.streamDurationMs ?? 0, item.durationMs)}%`,
              }}
            />
            <span
              aria-hidden="true"
              title={`Finalizing response: ${formatDurationMs(generationTiming.postStreamDurationMs ?? 0)}`}
              className="h-full flex-1 bg-slate-400 dark:bg-slate-500"
            />
          </span>
        ) : (
          <span
            className={cn(
              "absolute top-1/2 -translate-y-1/2 rounded-full",
              instant ? "size-2 -translate-x-1/2" : "h-2",
              item.kind === "generation" && item.timing?.ttftMs === null
                ? "bg-muted-foreground/55"
                : appearance.bar,
              item.status === "incomplete" &&
                "border border-dashed border-muted-foreground bg-transparent",
            )}
            style={
              instant
                ? { left: `${left}%` }
                : {
                    left: `${left}%`,
                    width: `max(3px, ${Math.min(width, 100 - left)}%)`,
                  }
            }
          />
        )}
      </span>

      <span
        className={cn(
          "text-right font-mono text-[10px] tabular-nums text-muted-foreground",
          item.kind === "wait" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {item.durationMs === null
          ? pointEvent
            ? `at ${formatDurationMs(offsetMs)}`
            : "—"
          : formatDurationMs(item.durationMs)}
      </span>
    </button>
  );
}

function TraceItemDrawer({
  item,
  onClose,
}: {
  item: TraceItem | undefined;
  onClose: () => void;
}) {
  return (
    <DetailInspectorDrawer
      open={Boolean(item)}
      onClose={onClose}
      title={item?.label ?? "Trace item"}
      description={item?.description ?? "Inspect trace item"}
      closeLabel="Close item details"
      badges={
        item ? (
          <StatusPill tone={traceStatusTone(item.status)}>
            {statusLabel(item.status)}
          </StatusPill>
        ) : undefined
      }
    >
      {item && <TraceInspector item={item} hideHeading />}
    </DetailInspectorDrawer>
  );
}

function TraceInspector({
  item,
  hideHeading = false,
}: {
  item: TraceItem;
  hideHeading?: boolean;
}) {
  const event = item.inspectEvent;
  return (
    <div className="min-w-0 p-5 md:p-6">
      {!hideHeading && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3
              aria-label={item.label}
              className="min-w-0 flex-1 text-sm font-semibold"
            >
              <OverflowText ariaLabel={item.label}>{item.label}</OverflowText>
            </h3>
            <StatusPill tone={traceStatusTone(item.status)}>
              {statusLabel(item.status)}
            </StatusPill>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.description}
          </p>
        </>
      )}

      {item.status === "interrupted" && isControlFlowInterrupt(event) && (
        <p className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          GraphInterrupt paused execution for human input; it is control flow,
          not a run failure.
        </p>
      )}
      {item.status === "incomplete" && (
        <p className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          No terminal event was captured. A later execution phase exists, so
          this operation is incomplete rather than still running.
        </p>
      )}
      {item.kind === "wait" && (
        <p className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          This idle period is compressed in the execution timeline. The duration
          shown here is the real wall-clock gap.
        </p>
      )}
      {item.kind === "generation" && item.timing?.ttftMs === null && (
        <p className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {item.timing.streaming
            ? "TTFT was not captured for this historical model call. The total provider duration is still accurate."
            : "This was a non-streaming model call, so time to first token does not apply."}
        </p>
      )}
      {item.kind === "generation" && item.timing?.ttftMs !== null && (
        <p className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          TTFT covers provider queueing, request setup, and model work until the
          first observed text chunk. The output-stream window runs from the
          first to last observed chunk; it is not pure model compute time.
        </p>
      )}

      <dl className="mt-4 divide-y">
        {item.kind === "execution" && item.executionRole && (
          <KeyValue label="Execution">
            {item.executionRole === "initial"
              ? "Initial phase"
              : item.executionRole === "resumed"
                ? `Resume ${Math.max(1, (item.phase ?? 2) - 1)}`
                : `Phase ${item.phase ?? "—"}`}
          </KeyValue>
        )}
        <KeyValue label="Started">
          <span className="font-mono">{formatDateTime(item.startedAt)}</span>
        </KeyValue>
        <KeyValue label="Duration">
          <span className="font-mono">
            {item.durationMs === null
              ? isPointEvent(item)
                ? "Instant event"
                : "Not captured"
              : formatDurationMs(item.durationMs)}
          </span>
        </KeyValue>
        {item.kind === "generation" && item.timing && (
          <>
            <KeyValue label="Provider request">
              <span className="font-mono">
                {formatDurationMs(item.durationMs ?? 0)}
              </span>
            </KeyValue>
            <KeyValue label="Waiting for first token">
              <span className="font-mono text-amber-600 dark:text-amber-400">
                {item.timing.ttftMs === null
                  ? item.timing.streaming
                    ? "Not captured"
                    : "Not applicable"
                  : formatDurationMs(item.timing.ttftMs)}
              </span>
            </KeyValue>
            {item.timing.streamDurationMs !== null && (
              <KeyValue label="First → last output chunk">
                <span className="font-mono text-violet-600 dark:text-violet-400">
                  {formatDurationMs(item.timing.streamDurationMs)}
                </span>
              </KeyValue>
            )}
            {item.timing.postStreamDurationMs !== null && (
              <KeyValue label="Finalizing response">
                <span className="font-mono">
                  {formatDurationMs(item.timing.postStreamDurationMs)}
                </span>
              </KeyValue>
            )}
          </>
        )}
        {item.endEvent && (
          <KeyValue label="Lifecycle">
            {item.event.type} → {item.endEvent.type}
          </KeyValue>
        )}
        <KeyValue label="Event type">{event.type}</KeyValue>
        <KeyValue label="Node">{event.nodeId ?? "Not captured"}</KeyValue>
        <KeyValue label="Workflow">{event.workflowId}</KeyValue>
        <KeyValue label="Span">
          <span className="font-mono">{event.spanId ?? "Not captured"}</span>
        </KeyValue>
        <KeyValue label="Parent span">
          <span className="font-mono">{event.parentSpanId ?? "Root"}</span>
        </KeyValue>
        <KeyValue label="Service">
          {event.serviceName}
          {event.deploymentRef ? ` · ${event.deploymentRef}` : ""}
        </KeyValue>
      </dl>

      <h4 className="mb-2 mt-5 text-xs font-medium">
        {item.endEvent ? "Created payload" : "Payload"}
      </h4>
      <PayloadViewer value={item.event.payload} />
      {item.endEvent && (
        <>
          <h4 className="mb-2 mt-5 text-xs font-medium">Resolution payload</h4>
          <PayloadViewer value={item.endEvent.payload} />
        </>
      )}
      {event.metadata && (
        <>
          <h4 className="mb-2 mt-5 text-xs font-medium">Metadata</h4>
          <PayloadViewer value={event.metadata} />
        </>
      )}
    </div>
  );
}

function kindAppearance(
  kind: TraceKind,
  status: TraceStatus,
  executionRole?: TraceItem["executionRole"],
): {
  icon: LucideIcon;
  iconColor: string;
  iconBackground: string;
  bar: string;
} {
  if (status === "failed")
    return {
      icon: CircleAlert,
      iconColor: "text-red-600 dark:text-red-400",
      iconBackground: "bg-red-500/10",
      bar: "bg-red-500",
    };
  if (kind === "execution")
    return {
      icon:
        executionRole === "resumed"
          ? RotateCcw
          : status === "interrupted"
            ? CirclePause
            : Play,
      iconColor: "text-indigo-600 dark:text-indigo-400",
      iconBackground: "bg-indigo-500/10",
      bar: "bg-indigo-500",
    };
  if (kind === "node")
    return {
      icon: Braces,
      iconColor: "text-sky-600 dark:text-sky-400",
      iconBackground: "bg-sky-500/10",
      bar: status === "interrupted" ? "bg-amber-500" : "bg-sky-500",
    };
  if (kind === "generation")
    return {
      icon: Bot,
      iconColor: "text-violet-600 dark:text-violet-400",
      iconBackground: "bg-violet-500/10",
      bar: "bg-violet-500",
    };
  if (kind === "tool")
    return {
      icon: Wrench,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      iconBackground: "bg-emerald-500/10",
      bar: "bg-emerald-500",
    };
  if (kind === "transition")
    return {
      icon: GitBranch,
      iconColor: "text-cyan-600 dark:text-cyan-400",
      iconBackground: "bg-cyan-500/10",
      bar: "bg-cyan-500",
    };
  if (kind === "interrupt")
    return {
      icon: status === "resolved" ? CheckCircle2 : CirclePause,
      iconColor:
        status === "resolved"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-amber-600 dark:text-amber-400",
      iconBackground:
        status === "resolved" ? "bg-emerald-500/10" : "bg-amber-500/10",
      bar: status === "resolved" ? "bg-emerald-500" : "bg-amber-500",
    };
  if (kind === "checkpoint")
    return {
      icon: Database,
      iconColor: "text-teal-600 dark:text-teal-400",
      iconBackground: "bg-teal-500/10",
      bar: "bg-teal-500",
    };
  if (kind === "wait")
    return {
      icon: TimerReset,
      iconColor: "text-amber-600 dark:text-amber-400",
      iconBackground: "bg-amber-500/10",
      bar: "bg-amber-500/70",
    };
  return {
    icon: Braces,
    iconColor: "text-muted-foreground",
    iconBackground: "bg-muted",
    bar: "bg-muted-foreground",
  };
}

function traceStatusTone(
  status: TraceStatus,
): "success" | "danger" | "warning" | "info" | "neutral" {
  if (status === "completed" || status === "resolved") return "success";
  if (status === "failed") return "danger";
  if (status === "interrupted" || status === "waiting" || status === "expired")
    return "warning";
  if (status === "running") return "info";
  return "neutral";
}

function percentOf(value: number, total: number) {
  return Math.min(100, Math.max(0, (value / Math.max(1, total)) * 100));
}

function Empty({ label }: { label: string }) {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">{label}</div>
  );
}
