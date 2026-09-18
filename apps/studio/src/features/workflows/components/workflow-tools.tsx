import Link from "next/link";
import { formatDurationMs } from "@/lib/format";
import type { WorkflowSelection } from "../lib/view-state";
import type { WorkflowSystem } from "../schema";

export function WorkflowTools({
  workflow,
  nodeId,
  cohort,
  environment,
  onSelect,
  onNavigate,
}: {
  workflow: WorkflowSystem["workflows"][number];
  nodeId?: string | undefined;
  cohort: WorkflowSystem["cohort"];
  environment?: string | undefined;
  onSelect: (selection: WorkflowSelection) => void;
  onNavigate?: (() => void) | undefined;
}) {
  const nodes = nodeId
    ? workflow.nodes.filter((node) => node.id === nodeId)
    : workflow.nodes;
  const attached = nodes.flatMap((node) =>
    (node.tools ?? []).map((tool) => ({ node, tool })),
  );
  const unresolved = nodes.filter(
    (node) => node.toolDiscovery?.status === "unresolved",
  );
  return (
    <section aria-label="Attached tools" className="space-y-2">
      <h4 className="text-xs font-medium">Attached tools</h4>
      <p className="text-[11px] text-muted-foreground">
        Source-discovered capabilities appear before traffic. Observed tools
        reflect real calls.
      </p>
      {unresolved.length > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Dynamic attachments are not fully resolved for{" "}
          {unresolved.map((node) => node.id).join(", ")}. More tools may appear
          after execution.
        </p>
      )}
      {!attached.length && (
        <p className="text-xs text-muted-foreground">
          {unresolved.length
            ? "No tools resolved or observed yet."
            : nodes.some((node) => !node.toolDiscovery)
              ? "Tool discovery information is unavailable. Republish this catalog with the current CLI."
              : "No attached tools."}
        </p>
      )}
      {nodes.some((node) => node.toolDiscovery?.publishedAt) && (
        <p className="text-[10px] text-muted-foreground">
          Catalog published:{" "}
          {nodes
            .map((node) => node.toolDiscovery?.publishedAt)
            .filter(Boolean)
            .sort()
            .at(-1)}
        </p>
      )}
      {attached.map(({ node, tool }) => {
        const params = new URLSearchParams({
          workflow: workflow.id,
          path: node.id,
          toolName: tool.name,
          includeChildren: "true",
          range: cohort.range,
        });
        if (tool.callingMode !== "unknown")
          params.set("toolMode", tool.callingMode);
        if (cohort.workflowId === workflow.id && cohort.version)
          params.set("version", cohort.version);
        if (environment && environment !== "All environments")
          params.set("env", environment);
        if (cohort.startedAfter)
          params.set("startedAfter", cohort.startedAfter);
        if (cohort.startedBefore)
          params.set("startedBefore", cohort.startedBefore);
        return (
          <details
            key={`${node.id}:${tool.name}:${tool.callingMode}`}
            className="rounded-md border p-2"
          >
            <summary className="cursor-pointer text-xs font-medium">
              <span className="font-mono">{tool.name}</span>
              <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                {tool.provenance === "source" ? "Available" : "Observed"} ·{" "}
                {tool.callingMode === "model"
                  ? "Available to model"
                  : tool.callingMode === "direct"
                    ? "Called directly"
                    : "Caller not captured"}
              </span>
            </summary>
            <div className="mt-2 space-y-2 text-[11px]">
              {tool.description && (
                <p className="text-muted-foreground">{tool.description}</p>
              )}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() =>
                  onSelect({
                    type: "node",
                    workflowId: workflow.id,
                    id: node.id,
                  })
                }
              >
                Node: {node.id}
              </button>
              {tool.inputFields?.length ? (
                <ul>
                  {tool.inputFields.map((field) => (
                    <li key={field.name}>
                      <code>{field.name}</code>: {field.type}
                      {field.required ? " (required)" : " (optional)"}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p>
                {tool.calls} executions · {tool.replays} replays
              </p>
              <p>
                {tool.successes} succeeded · {tool.denials} denied ·{" "}
                {tool.faults} faults · {tool.cancellations} cancelled
              </p>
              <p>
                Execution p50 / p95: {formatDurationMs(tool.p50DurationMs)} /{" "}
                {formatDurationMs(tool.p95DurationMs)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="text-primary hover:underline"
                  href={`/runs?${params}`}
                  onClick={onNavigate}
                >
                  View calls
                </Link>
                {(["denied", "fault", "cancelled", "reused"] as const).map(
                  (outcome) => (
                    <Link
                      key={outcome}
                      className="text-primary hover:underline"
                      href={`/runs?${params}&toolOutcome=${outcome}`}
                      onClick={onNavigate}
                    >
                      {outcome === "reused"
                        ? "Replays"
                        : outcome === "fault"
                          ? "Faults"
                          : outcome === "denied"
                            ? "Denials"
                            : "Cancellations"}
                    </Link>
                  ),
                )}
              </div>
            </div>
          </details>
        );
      })}
    </section>
  );
}
