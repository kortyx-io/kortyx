import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CirclePause,
  CircleX,
  Clock3,
  GitBranch,
  ListTree,
  LoaderCircle,
  ScrollText,
} from "lucide-react";
import Link from "next/link";
import type { Run } from "@/features/runs/types";

export function RunDetail({ run }: { run: Run }) {
  const status = statusMeta[run.status];
  const StatusIcon = status.icon;

  return (
    <div className="mx-auto h-full max-w-6xl rounded-xl border bg-background p-6 shadow-sm">
      <Link
        href="/runs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to runs
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <StatusIcon
              className={`size-5 ${status.className} ${run.status === "running" ? "animate-spin" : ""}`}
            />
            <h1 className="font-mono text-lg font-semibold">{run.id}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {run.workflow} {run.version} · {run.environment} · started{" "}
            {run.startedAt}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.badgeClassName}`}
        >
          {status.label}
        </span>
      </div>
      <div className="mt-6 flex gap-6 border-b text-sm">
        <button
          type="button"
          className="border-b-2 border-foreground pb-3 font-medium"
        >
          Timeline
        </button>
        <button type="button" className="pb-3 text-muted-foreground">
          Workflow
        </button>
        <button type="button" className="pb-3 text-muted-foreground">
          Logs
        </button>
      </div>
      <div className="mt-7 grid gap-6 md:grid-cols-[1fr_280px]">
        <section className="relative space-y-7 border-l pl-7">
          <TimelineEvent
            icon={Clock3}
            title="Run started"
            description={`Session ${run.session} received a request.`}
            time="0ms"
          />
          {run.path.map((node, index) => (
            <TimelineEvent
              key={node}
              icon={index === 0 ? GitBranch : ListTree}
              title={`${node} completed`}
              description={`Workflow step ${index + 1} of ${run.path.length} completed.`}
              time={formatDuration(
                (run.duration * (index + 1)) / (run.path.length + 1),
              )}
            />
          ))}
          <TimelineEvent
            icon={ScrollText}
            title={`Run ${status.label.toLowerCase()}`}
            description={run.result}
            time={formatDuration(run.duration)}
          />
        </section>
        <aside className="rounded-lg border bg-muted/30 p-4 text-sm">
          <h2 className="font-medium">Run summary</h2>
          <dl className="mt-4 space-y-3 text-muted-foreground">
            <div className="flex justify-between">
              <dt>Duration</dt>
              <dd className="font-mono text-foreground">
                {formatDuration(run.duration)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Tokens</dt>
              <dd className="font-mono text-foreground">
                {run.tokens?.toLocaleString() ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Estimated cost</dt>
              <dd className="font-mono text-foreground">
                {run.cost === undefined ? "—" : `$${run.cost.toFixed(3)}`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Model</dt>
              <dd className="text-foreground">{run.model}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

const statusMeta: Record<
  Run["status"],
  {
    label: string;
    icon: typeof CheckCircle2;
    className: string;
    badgeClassName: string;
  }
> = {
  running: {
    label: "Running",
    icon: LoaderCircle,
    className: "text-blue-600",
    badgeClassName: "bg-blue-500/10 text-blue-700",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "text-emerald-600",
    badgeClassName: "bg-emerald-500/10 text-emerald-700",
  },
  interrupted: {
    label: "Interrupted",
    icon: CirclePause,
    className: "text-amber-600",
    badgeClassName: "bg-amber-500/10 text-amber-700",
  },
  failed: {
    label: "Failed",
    icon: CircleAlert,
    className: "text-red-600",
    badgeClassName: "bg-red-500/10 text-red-700",
  },
  cancelled: {
    label: "Cancelled",
    icon: CircleX,
    className: "text-muted-foreground",
    badgeClassName: "bg-muted text-muted-foreground",
  },
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function TimelineEvent({
  icon: Icon,
  title,
  description,
  time,
}: {
  icon: typeof Clock3;
  title: string;
  description: string;
  time: string;
}) {
  return (
    <div className="relative">
      <span className="absolute -left-[39px] flex size-6 items-center justify-center rounded-full border bg-background">
        <Icon className="size-3.5 text-muted-foreground" />
      </span>
      <div className="flex justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <time className="font-mono text-xs text-muted-foreground">{time}</time>
      </div>
    </div>
  );
}
