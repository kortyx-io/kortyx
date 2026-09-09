"use client";

import {
  projectWorkflowCalls,
  type StudioRunDetailResponse,
  type StudioWorkflowCall,
} from "@kortyx/telemetry-contracts";
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  GitBranch,
  Workflow,
} from "lucide-react";
import { parseAsString } from "nuqs";
import { useMemo, useState } from "react";
import { DetailLink } from "@/components/detail/detail-link";
import { KeyValue, StatusPill } from "@/components/detail/detail-primitives";
import { formatDurationMs } from "@/lib/format";
import { useStudioQueryState } from "@/lib/nuqs";
import { cn } from "@/lib/utils";

export function WorkflowCalls({ detail }: { detail: StudioRunDetailResponse }) {
  const calls = useMemo(
    () => projectWorkflowCalls(detail.events),
    [detail.events],
  );
  const branches = [...new Set(calls.map((call) => call.branchId))];
  const [branch, setBranch] = useStudioQueryState(
    "branch",
    parseAsString.withDefault(""),
  );
  const [selection, setSelection] = useStudioQueryState(
    "call",
    parseAsString.withDefault(""),
  );
  const currentBranch = branches.includes(branch) ? branch : branches.at(-1);
  const visible = calls.filter((call) => call.branchId === currentBranch);
  const selected = visible.find((call) => call.invocationId === selection);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const nodes = (invocationId: string | null) => {
    const nodeEvents = detail.events.filter(
      (event) =>
        event.type === "span.started" &&
        event.payload.name === "kortyx.node" &&
        (event.payload.invocationId ?? null) === invocationId &&
        (!event.payload.branchId || event.payload.branchId === currentBranch),
    );
    return [
      ...new Set(
        nodeEvents
          .map((event) => event.nodeId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  };
  const renderNodes = (parent: string | null, depth: number) => {
    if (depth > 32) return null;
    const children = visible.filter(
      (call) => call.parentInvocationId === parent,
    );
    const nodeIds = [
      ...new Set([
        ...nodes(parent),
        ...children.map((call) => call.callerNodeId),
      ]),
    ];
    return nodeIds.map((nodeId) => (
      <div key={`${parent}:${nodeId}`}>
        <div
          className="flex items-center gap-2 border-b border-border/50 py-2.5 pr-4 text-xs"
          style={{ paddingLeft: 20 + depth * 20 }}
        >
          <span className="size-1.5 rounded-full bg-muted-foreground/60" />
          <span className="font-mono">{nodeId}</span>
          <span className="text-muted-foreground">node</span>
        </div>
        {detail.events
          .filter(
            (event) =>
              event.type === "generation.completed" &&
              event.nodeId === nodeId &&
              (event.payload.invocationId ?? null) === parent &&
              (!event.payload.branchId ||
                event.payload.branchId === currentBranch),
          )
          .map((event) => (
            <div
              key={event.id}
              className="flex gap-2 py-2 text-xs text-muted-foreground"
              style={{ paddingLeft: 40 + depth * 20 }}
            >
              <CornerDownRight className="size-3.5" />
              Generation · {String(event.payload.model ?? "model")}
              <span className="ml-auto pr-4">
                {formatDurationMs(
                  typeof event.payload.durationMs === "number"
                    ? event.payload.durationMs
                    : null,
                )}
              </span>
            </div>
          ))}
        {children
          .filter((call) => call.callerNodeId === nodeId)
          .map((call) => (
            <div key={call.id}>
              <div
                className={cn(
                  "flex items-center gap-1 border-y border-border/50 py-2 pr-3",
                  selected?.id === call.id ? "bg-violet-500/10" : "bg-muted/25",
                )}
                style={{ paddingLeft: 22 + depth * 20 }}
              >
                <button
                  type="button"
                  aria-label={`${collapsed.has(call.id) ? "Expand" : "Collapse"} ${call.callId}`}
                  onClick={() => toggle(call.id)}
                  className="rounded p-1 hover:bg-muted"
                >
                  {collapsed.has(call.id) ? (
                    <ChevronRight className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelection(call.invocationId, { shallow: true })
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
                >
                  <Workflow className="size-4 shrink-0 text-violet-500" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {call.targetWorkflowId}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {call.callId} · {call.targetVersion ?? "version unknown"}
                      {call.inherited ? " · inherited" : ""}
                      {call.reused ? " · cached result" : ""}
                    </span>
                  </span>
                  <span className="ml-auto">
                    <CallStatus call={call} />
                  </span>
                </button>
              </div>
              {!collapsed.has(call.id) &&
                renderNodes(call.invocationId, depth + 1)}
              {!collapsed.has(call.id) && call.status === "completed" && (
                <button
                  type="button"
                  onClick={() =>
                    setSelection(call.invocationId, { shallow: true })
                  }
                  className="w-full py-2 text-left text-xs text-emerald-600"
                  style={{ paddingLeft: 48 + depth * 20 }}
                >
                  ↩{" "}
                  {call.reused
                    ? "Cached result reused"
                    : "Result returned to parent"}
                </button>
              )}
            </div>
          ))}
      </div>
    ));
  };
  return (
    <div className="h-full overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold">Workflow calls</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {visible.length} {visible.length === 1 ? "call" : "calls"} · parent
            continues after each result returns
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <GitBranch className="size-3.5" />
          Branch
          <select
            aria-label="Execution branch"
            className="max-w-48 rounded border bg-background px-2 py-1"
            value={currentBranch}
            onChange={(event) => {
              void setBranch(event.target.value, { shallow: true });
              void setSelection(null, { shallow: true });
            }}
          >
            {branches.map((id, index) => (
              <option key={id} value={id}>
                {index === 0
                  ? visible.some((call) => call.inherited)
                    ? "Fork"
                    : "Original"
                  : `Restored ${index}`}{" "}
                · {id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className={cn(
          "grid min-w-0",
          selected && "@4xl:grid-cols-[minmax(0,1fr)_340px]",
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 border-b px-5 py-4 text-sm font-semibold">
            <Workflow className="size-4" />
            {detail.run.workflowId}
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
              ROOT EXECUTION
            </span>
          </div>
          {renderNodes(null, 0)}
          {visible
            .filter(
              (call) =>
                call.parentInvocationId &&
                !visible.some(
                  (parent) => parent.invocationId === call.parentInvocationId,
                ),
            )
            .map((call) => (
              <button
                key={call.id}
                type="button"
                onClick={() =>
                  setSelection(call.invocationId, { shallow: true })
                }
                className="block p-4 text-xs"
              >
                {call.targetWorkflowId} · Parent telemetry unavailable
              </button>
            ))}
        </div>
        {selected && (
          <aside className="min-w-0 border-l bg-muted/10 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{selected.callId}</h3>
              <button
                type="button"
                onClick={() => setSelection(null, { shallow: true })}
                className="text-xs text-muted-foreground"
              >
                Close
              </button>
            </div>
            <CallStatus call={selected} />
            <dl className="mt-4 divide-y">
              <KeyValue label="Workflow">{selected.targetWorkflowId}</KeyValue>
              <KeyValue label="Called by">
                {selected.sourceWorkflowId} / {selected.callerNodeId}
              </KeyValue>
              <KeyValue label="Invocation">
                <span className="break-all font-mono text-[10px]">
                  {selected.invocationId}
                </span>
              </KeyValue>
              <KeyValue label="Attempts">
                {selected.attempts}
                {selected.reused ? ` · ${selected.reused} cached reuses` : ""}
              </KeyValue>
              <KeyValue label="Active execution">
                {selected.attempts
                  ? formatDurationMs(selected.activeMs)
                  : selected.inherited
                    ? "No new execution"
                    : "Not captured"}
              </KeyValue>
              <KeyValue label="Completed wait">
                {formatDurationMs(selected.waitMs)}
              </KeyValue>
              <KeyValue label="Wall time">
                {selected.endedAt
                  ? formatDurationMs(
                      Date.parse(selected.endedAt) -
                        Date.parse(selected.startedAt),
                    )
                  : "Still open"}
              </KeyValue>
              {selected.sourceRunId && (
                <KeyValue label="Inherited from">
                  <DetailLink
                    className="underline"
                    href={`/runs/${selected.sourceRunId}?tab=calls`}
                  >
                    Source execution
                  </DetailLink>
                </KeyValue>
              )}
            </dl>
            {selected.status === "interrupted" && (
              <div className="mt-4 rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-700">
                Waiting in{" "}
                {selected.leaf?.workflowId ?? selected.targetWorkflowId}
                {selected.leaf?.nodeId ? ` / ${selected.leaf.nodeId}` : ""}. The
                parent is suspended.
                {detail.interrupts.find(
                  (interrupt) => interrupt.status === "pending",
                ) && (
                  <DetailLink
                    className="mt-2 block underline"
                    href={`/interrupts/${detail.interrupts.find((interrupt) => interrupt.status === "pending")?.id}`}
                  >
                    Open human interrupt
                  </DetailLink>
                )}
              </div>
            )}
            {(["input", "output"] as const).map((side) => (
              <section key={side} className="mt-5">
                <h4 className="mb-2 text-xs font-semibold capitalize">
                  {side === "output" ? "Returned data" : side}
                </h4>
                {side in selected ? (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-background p-3 text-[11px]">
                    {JSON.stringify(selected[side], null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {String(
                      selected[`${side}Omitted`] ??
                        (side === "output" && selected.status !== "completed"
                          ? "Awaiting a returned result."
                          : "Content was not captured."),
                    )}
                  </p>
                )}
              </section>
            ))}
            <section className="mt-5">
              <h4 className="mb-2 text-xs font-semibold">Lifecycle</h4>
              {selected.events.map((event) => (
                <div
                  key={event.id}
                  className="flex justify-between gap-3 py-1 text-[11px]"
                >
                  <span>{event.type.replace("workflow.call.", "")}</span>
                  <time className="font-mono text-muted-foreground">
                    {new Date(event.occurredAt).toLocaleTimeString()}
                  </time>
                </div>
              ))}
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
function CallStatus({ call }: { call: StudioWorkflowCall }) {
  return (
    <StatusPill
      tone={
        call.status === "completed"
          ? "success"
          : call.status === "failed"
            ? "danger"
            : call.status === "interrupted"
              ? "warning"
              : "info"
      }
    >
      {call.status === "interrupted"
        ? "Waiting for input"
        : call.status === "completed"
          ? "Returned"
          : call.status}
    </StatusPill>
  );
}
