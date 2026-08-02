"use client";

import type {
  StudioDetailEvent,
  StudioRunDetailResponse,
} from "@kortyx/telemetry-contracts";
import { Bot, CirclePause, Clock3, RotateCcw, Timer } from "lucide-react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatDurationMs } from "@/lib/format";

export function RunOverview({ detail }: { detail: StudioRunDetailResponse }) {
  const events = detail.events;
  const runStarts = events.filter(
    (event) =>
      event.type === "span.started" && event.payload.name === "kortyx.run",
  );
  const resumptions = runStarts.filter((start) =>
    events.some(
      (event) =>
        event.type === "interrupt.resolved" &&
        Date.parse(event.occurredAt) <= Date.parse(start.occurredAt) &&
        Date.parse(start.occurredAt) - Date.parse(event.occurredAt) < 2_000,
    ),
  ).length;
  const generationEvents = events.filter(
    (event) => event.type === "generation.completed",
  );
  const capturedTtfts = generationEvents
    .map((event) => nullableNumber(event.payload.ttftMs))
    .filter((value): value is number => value !== null);
  const medianTtft = median(capturedTtfts);
  const streamingCalls = generationEvents.filter((event) =>
    generationWasStreaming(event, events),
  ).length;
  const interrupts = events.filter(
    (event) => event.type === "interrupt.created",
  ).length;
  const largestGap = largestEventGap(events);

  return (
    <div className="@container space-y-4 p-4 md:p-6">
      <div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-5">
        <SignalCard
          icon={RotateCcw}
          label="Resumptions"
          value={resumptions}
          detail={
            resumptions > 0
              ? "Continued after human input"
              : "No interrupted resumes"
          }
          explanation="A resumption continues the same logical run from a saved interrupt checkpoint. It is not a retry or a second run."
        />
        <SignalCard
          icon={Bot}
          label="Model calls"
          value={generationEvents.length}
          detail={`${detail.run.models.length || 1} model${detail.run.models.length === 1 ? "" : "s"}`}
          explanation="Provider requests captured inside this run. Calls may be streaming or non-streaming depending on how the SDK invoked the model."
        />
        <SignalCard
          icon={Timer}
          label="Median TTFT"
          value={medianTtft === null ? "N/A" : formatDurationMs(medianTtft)}
          detail={
            capturedTtfts.length > 0
              ? `${capturedTtfts.length} streaming call${capturedTtfts.length === 1 ? "" : "s"} measured`
              : streamingCalls === 0
                ? "Not applicable · non-streaming calls"
                : `Not captured for ${streamingCalls} streaming call${streamingCalls === 1 ? "" : "s"}`
          }
          explanation="Time to first token (TTFT) runs from the provider request until the first observed text chunk. It applies only to streaming calls with text output; non-streaming calls return a completed response instead."
        />
        <SignalCard
          icon={CirclePause}
          label="Interrupts"
          value={interrupts}
          detail={
            interrupts ? "Human wait affected wall time" : "No human wait"
          }
          explanation="A human-input interrupt pauses graph execution. Its wait contributes to wall time but is shown separately from active execution time."
        />
        <SignalCard
          icon={Clock3}
          label="Largest quiet period"
          value={formatDurationMs(largestGap)}
          detail="No telemetry events emitted"
          explanation="The longest interval between adjacent telemetry events. It can contain a provider request, tool work, human wait, or genuinely unobserved time, so the trace provides the stronger attribution."
        />
      </div>

      <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <ChartCard
          title="Activity over wall time"
          description="Event density reveals execution bursts and waiting gaps."
          help="Each bar counts telemetry events in a wall-clock bucket. Empty space means no events were emitted; it does not automatically mean the process was idle."
        >
          <ActivityChart events={events} />
        </ChartCard>
        <ChartCard
          title="Slowest completed spans"
          description="Duration reported by completed span events."
          help="These are completed operation durations. Nested spans overlap, so their values should not be added together to estimate total run time."
        >
          <LatencyBars events={events} />
        </ChartCard>
      </div>

      <ChartCard
        title="Model latency by call"
        description="Separates time before the first observed token, the first-to-last output chunk window, and response finalization. Older calls remain unclassified instead of being estimated."
        help="TTFT includes provider queueing, setup, and model work before the first observed text chunk. Output stream is the observed first-to-last chunk window, not pure model compute. Finalization is the time from the last chunk until completion."
      >
        <ModelLatencyBars events={events} />
      </ChartCard>

      <ChartCard
        title="Token usage by model call"
        description="Input, output, and reasoning tokens for each captured model call."
        help="Token counts are reported by the model provider. Availability and category definitions can vary by provider and model."
      >
        <TokenBars events={events} />
      </ChartCard>
    </div>
  );
}

function SignalCard({
  icon: Icon,
  label,
  value,
  detail,
  explanation,
}: {
  icon: typeof Clock3;
  label: string;
  value: string | number;
  detail: string;
  explanation: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/15 p-3.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        <span>{label}</span>
        <InfoTooltip label={`Explain ${label}`}>{explanation}</InfoTooltip>
      </div>
      <p className="mt-2 font-mono text-lg font-semibold tabular-nums">
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function ChartCard({
  title,
  description,
  help,
  children,
}: {
  title: string;
  description: string;
  help: ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border bg-background p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="text-xs font-semibold">{title}</h3>
        <InfoTooltip label={`Explain ${title}`}>{help}</InfoTooltip>
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ActivityChart({ events }: { events: StudioDetailEvent[] }) {
  if (events.length < 2) return <EmptyChart />;
  const start = Date.parse(events[0]?.occurredAt ?? "");
  const end = Date.parse(events.at(-1)?.occurredAt ?? "");
  const duration = Math.max(1, end - start);
  const bucketCount = 36;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    label: formatDurationMs((index / (bucketCount - 1)) * duration),
    events: 0,
  }));
  for (const event of events) {
    const ratio = (Date.parse(event.occurredAt) - start) / duration;
    const index = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor(ratio * bucketCount)),
    );
    const bucket = buckets[index];
    if (bucket) bucket.events += 1;
  }
  const interruptLabels = [
    ...new Set(
      events
        .filter((event) => event.type.startsWith("interrupt."))
        .map((event) => {
          const ratio = (Date.parse(event.occurredAt) - start) / duration;
          const index = Math.min(
            bucketCount - 1,
            Math.max(0, Math.floor(ratio * bucketCount)),
          );
          return buckets[index]?.label;
        })
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  return (
    <figure className="h-44 w-full" aria-label="Event activity over run time">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={buckets}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            minTickGap={80}
            tick={axisTickStyle}
          />
          <YAxis hide allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.45 }}
            contentStyle={tooltipStyle}
          />
          {interruptLabels.map((label) => (
            <ReferenceLine
              key={label}
              x={label}
              stroke="var(--color-amber-500)"
              strokeDasharray="3 3"
            />
          ))}
          <Bar
            dataKey="events"
            name="Events"
            fill="var(--foreground)"
            fillOpacity={0.7}
            radius={[2, 2, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

function LatencyBars({ events }: { events: StudioDetailEvent[] }) {
  const spans = events
    .filter((event) => event.type === "span.ended")
    .map((event) => {
      const operation =
        typeof event.payload.name === "string" ? event.payload.name : "span";
      return {
        id: event.id,
        operation,
        name:
          operation === "kortyx.node"
            ? (event.nodeId ?? "workflow node")
            : operation,
        duration:
          typeof event.payload.durationMs === "number"
            ? event.payload.durationMs
            : 0,
      };
    })
    .filter(
      (span) =>
        span.duration > 0 && !INTERNAL_LATENCY_SPANS.has(span.operation),
    )
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 6);
  if (spans.length === 0) return <EmptyChart />;
  return (
    <figure className="h-44 w-full" aria-label="Slowest completed spans">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={spans.map((span, index) => ({
            ...span,
            label: `${index + 1}. ${span.name}`,
          }))}
          layout="vertical"
          margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={132}
            interval={0}
            axisLine={false}
            tickLine={false}
            tick={<ChartYAxisTick maxCharacters={18} noun="Span" />}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.45 }}
            contentStyle={tooltipStyle}
            labelFormatter={(label) => formatChartLabel(String(label), "Span")}
            formatter={(value) => [formatDurationMs(Number(value)), "Duration"]}
          />
          <Bar
            dataKey="duration"
            name="Duration"
            fill="var(--foreground)"
            fillOpacity={0.7}
            radius={[0, 3, 3, 0]}
            maxBarSize={12}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

function ModelLatencyBars({ events }: { events: StudioDetailEvent[] }) {
  const generations = events
    .filter((event) => event.type === "generation.completed")
    .map((event, index) => {
      const duration = generationDuration(event, events);
      const ttft = nullableNumber(event.payload.ttftMs);
      const generating = nullableNumber(event.payload.streamDurationMs);
      const finalizing = nullableNumber(event.payload.postStreamDurationMs);
      const classified = (ttft ?? 0) + (generating ?? 0) + (finalizing ?? 0);
      const name =
        event.nodeId ??
        (typeof event.payload.model === "string"
          ? event.payload.model
          : "model call");
      return {
        id: event.id,
        label: `${index + 1}. ${name}`,
        ttft: ttft ?? 0,
        generating: generating ?? 0,
        finalizing: finalizing ?? 0,
        unclassified:
          ttft === null ? duration : Math.max(0, duration - classified),
      };
    });
  if (generations.length === 0) return <EmptyChart />;

  return (
    <figure
      className="w-full"
      style={{ height: Math.max(180, generations.length * 32) }}
      aria-label="Model latency breakdown"
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={generations}
          layout="vertical"
          margin={{ top: 0, right: 8, bottom: 20, left: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={208}
            interval={0}
            axisLine={false}
            tickLine={false}
            tick={<ChartYAxisTick maxCharacters={30} noun="Call" />}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.45 }}
            contentStyle={tooltipStyle}
            labelFormatter={(label) => formatChartLabel(String(label), "Call")}
            formatter={(value) => formatDurationMs(Number(value))}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar
            dataKey="ttft"
            name="Waiting for first token"
            stackId="latency"
            fill="var(--color-amber-500)"
            isAnimationActive={false}
          />
          <Bar
            dataKey="generating"
            name="Output stream"
            stackId="latency"
            fill="var(--color-violet-500)"
            isAnimationActive={false}
          />
          <Bar
            dataKey="finalizing"
            name="Finalizing response"
            stackId="latency"
            fill="var(--color-slate-400)"
            isAnimationActive={false}
          />
          <Bar
            dataKey="unclassified"
            name="Unclassified provider time"
            stackId="latency"
            fill="var(--muted-foreground)"
            fillOpacity={0.45}
            radius={[0, 3, 3, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

function TokenBars({ events }: { events: StudioDetailEvent[] }) {
  const generations = events
    .filter((event) => event.type === "generation.completed")
    .map((event, index) => {
      const usage = isRecord(event.payload.usage) ? event.payload.usage : {};
      const name =
        event.nodeId ??
        (typeof event.payload.model === "string"
          ? event.payload.model
          : "generation");
      return {
        id: event.id,
        name,
        label: `${index + 1}. ${name}`,
        model:
          typeof event.payload.model === "string"
            ? event.payload.model
            : "unknown model",
        input: numberValue(usage.input),
        output: numberValue(usage.output),
        reasoning: numberValue(usage.reasoning),
      };
    });
  if (generations.length === 0) return <EmptyChart />;
  return (
    <figure
      className="w-full"
      style={{ height: Math.max(240, generations.length * 32) }}
      aria-label="Token usage by model call"
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={generations}
          layout="vertical"
          margin={{ top: 0, right: 8, bottom: 20, left: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tick={axisTickStyle}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={208}
            interval={0}
            axisLine={false}
            tickLine={false}
            tick={<ChartYAxisTick maxCharacters={30} noun="Call" />}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.45 }}
            contentStyle={tooltipStyle}
            labelFormatter={(label) => formatChartLabel(String(label), "Call")}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar
            dataKey="input"
            name="Input"
            stackId="tokens"
            fill="var(--color-blue-500)"
            isAnimationActive={false}
          />
          <Bar
            dataKey="output"
            name="Output"
            stackId="tokens"
            fill="var(--color-emerald-500)"
            isAnimationActive={false}
          />
          <Bar
            dataKey="reasoning"
            name="Reasoning"
            stackId="tokens"
            fill="var(--color-violet-500)"
            radius={[0, 3, 3, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

const axisTickStyle = {
  fill: "var(--muted-foreground)",
  fontSize: 10,
};

function ChartYAxisTick({
  x = 0,
  y = 0,
  payload,
  maxCharacters,
  noun,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
  maxCharacters: number;
  noun: "Call" | "Span";
}) {
  const raw = String(payload?.value ?? "");
  const { ordinal, name } = parseChartLabel(raw);
  const readableName = humanizeIdentifier(name);
  const shortName = truncateLabel(readableName, maxCharacters);
  const fullTitle = `${noun} ${ordinal} · ${readableName}`;

  return (
    <g transform={`translate(${x},${y})`}>
      <title>{fullTitle}</title>
      <text
        x={-8}
        y={0}
        dominantBaseline="middle"
        textAnchor="end"
        fontSize={10}
      >
        <tspan fill="var(--muted-foreground)" opacity={0.65}>
          {ordinal.padStart(2, "0")}
        </tspan>
        <tspan dx={7} fill="var(--muted-foreground)">
          {shortName}
        </tspan>
      </text>
    </g>
  );
}

function formatChartLabel(value: string, noun: "Call" | "Span") {
  const { ordinal, name } = parseChartLabel(value);
  return `${noun} ${ordinal} · ${humanizeIdentifier(name)}`;
}

function parseChartLabel(value: string) {
  const match = /^(\d+)\.\s*(.+)$/.exec(value);
  return {
    ordinal: match?.[1] ?? "—",
    name: match?.[2] ?? value,
  };
}

function humanizeIdentifier(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function truncateLabel(value: string, maxCharacters: number) {
  if (value.length <= maxCharacters) return value;
  return `${value.slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…`;
}

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  fontSize: 11,
};

function EmptyChart() {
  return (
    <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
      Not enough captured data
    </div>
  );
}

function largestEventGap(events: StudioDetailEvent[]): number {
  let largest = 0;
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    if (!previous || !current) continue;
    largest = Math.max(
      largest,
      Date.parse(current.occurredAt) - Date.parse(previous.occurredAt),
    );
  }
  return largest;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function generationDuration(
  generation: StudioDetailEvent,
  events: StudioDetailEvent[],
) {
  const captured = nullableNumber(generation.payload.durationMs);
  if (captured !== null) return captured;
  const ended = events.find(
    (event) =>
      event.type === "span.ended" &&
      event.spanId !== null &&
      event.spanId === generation.spanId,
  );
  return nullableNumber(ended?.payload.durationMs) ?? 0;
}

function generationWasStreaming(
  generation: StudioDetailEvent,
  events: StudioDetailEvent[],
) {
  const started = events.find(
    (event) =>
      event.type === "span.started" &&
      event.spanId !== null &&
      event.spanId === generation.spanId,
  );
  const attributes = isRecord(started?.payload.attributes)
    ? started.payload.attributes
    : {};
  return attributes.stream !== false;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((first, second) => first - second);
  const middle = Math.floor(ordered.length / 2);
  const value = ordered[middle];
  if (value === undefined) return null;
  if (ordered.length % 2 === 1) return value;
  return ((ordered[middle - 1] ?? value) + value) / 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const INTERNAL_LATENCY_SPANS = new Set([
  "kortyx.run",
  "useReason",
  "runReasonEngine",
]);
