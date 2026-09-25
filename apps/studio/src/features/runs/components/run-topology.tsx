"use client";

import "@xyflow/react/dist/style.css";

import dagre from "@dagrejs/dagre";
import type { StudioRunDetailResponse } from "@kortyx/telemetry-contracts";
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  buildRunTopology,
  type RunTopologyWorkflow,
} from "@/features/runs/lib/run-topology";
import { formatDurationMs } from "@/lib/format";
import { cn } from "@/lib/utils";

const WIDTH = 294;
const nodeTypes = { workflow: WorkflowCard };

export function RunTopology({ detail }: { detail: StudioRunDetailResponse }) {
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const topology = useMemo(() => buildRunTopology(detail), [detail]);
  const graph = useMemo(() => {
    const layout = new dagre.graphlib.Graph({ multigraph: true });
    layout.setGraph({ rankdir: "LR", ranksep: 110, nodesep: 50 });
    layout.setDefaultEdgeLabel(() => ({}));
    for (const workflow of topology.workflows)
      layout.setNode(workflow.id, {
        width: WIDTH,
        height: cardHeight(workflow),
      });
    for (const call of topology.calls)
      if (call.sourceWorkflowId !== call.targetWorkflowId)
        layout.setEdge(
          call.sourceWorkflowId,
          call.targetWorkflowId,
          {},
          call.id,
        );
    dagre.layout(layout);
    const nodes: Node[] = topology.workflows.map((workflow) => {
      const position = layout.node(workflow.id);
      return {
        id: workflow.id,
        type: "workflow",
        position: {
          x: (position?.x ?? 0) - WIDTH / 2,
          y: (position?.y ?? 0) - cardHeight(workflow) / 2,
        },
        data: { workflow, root: workflow.id === detail.run.workflowId },
        draggable: false,
      };
    });
    const edges: Edge[] = topology.calls
      .filter((call) => call.sourceWorkflowId !== call.targetWorkflowId)
      .map((call) => ({
        id: call.id,
        source: call.sourceWorkflowId,
        sourceHandle:
          call.callerNodeIds.length === 1 ? call.callerNodeIds[0] : undefined,
        target: call.targetWorkflowId,
        type: "smoothstep",
        animated: false,
        label: `${call.count} ${call.count === 1 ? "call" : "calls"}${call.failed ? ` · ${call.failed} failed` : ""}`,
        labelStyle: { fill: "currentColor", fontSize: 11 },
        labelBgStyle: { fill: "var(--background)", fillOpacity: 0.95 },
        style: {
          stroke: call.failed
            ? "var(--destructive)"
            : "var(--muted-foreground)",
          strokeWidth: 1.5,
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      }));
    return { nodes, edges };
  }, [topology, detail.run.workflowId]);

  useEffect(() => {
    if (!flow || !canvasRef.current) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (canvasRef.current?.clientWidth && canvasRef.current.clientHeight)
          void flow.fitView({ padding: 0.18, maxZoom: 1, duration: 0 });
      });
    });
    observer.observe(canvasRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [flow]);

  return (
    <div className="flex h-full min-h-[420px] flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Run topology</h3>
          <p className="text-xs text-muted-foreground">
            Observed workflows, nodes, and calls in this run. Nodes are listed
            by first appearance; simultaneous nodes may run in parallel.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {topology.workflows.length} workflows ·{" "}
          {topology.workflows.reduce((sum, item) => sum + item.nodes.length, 0)}{" "}
          nodes
        </span>
      </div>
      <div ref={canvasRef} className="min-h-[360px] flex-1">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onInit={setFlow}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} className="opacity-40" />
          <Controls
            showInteractive={false}
            className="!overflow-hidden !rounded-md !border !border-border !bg-card !shadow-sm [&_button]:!border-border [&_button]:!bg-card [&_button]:!fill-foreground [&_button]:!text-foreground [&_button:hover]:!bg-muted [&_svg]:!fill-current"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

function cardHeight(workflow: RunTopologyWorkflow) {
  return 78 + Math.max(1, workflow.nodes.length) * 39;
}

function WorkflowCard({
  data,
}: NodeProps<Node<{ workflow: RunTopologyWorkflow; root: boolean }>>) {
  const { workflow, root } = data;
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-md"
      style={{ width: WIDTH }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-1 !border-0 !bg-muted-foreground"
      />
      <div className="flex items-center gap-2 border-b bg-muted/35 px-3 py-2.5">
        <Workflow
          aria-hidden="true"
          className="size-4 shrink-0 text-violet-500"
        />
        <span
          className="min-w-0 flex-1 truncate text-xs font-semibold"
          title={workflow.id}
        >
          {workflow.id}
        </span>
        {root && (
          <span className="text-[10px] text-muted-foreground">Root</span>
        )}
      </div>
      <div className="p-2">
        {workflow.nodes.length ? (
          workflow.nodes.map((node) => (
            <div
              key={node.id}
              className="relative flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-muted/40"
              title={`${node.id} · ${node.status}${node.attempts > 1 ? ` · ${node.attempts} attempts` : ""}`}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${node.id}: ${node.status}`}
                    className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 rounded-full",
                        node.status === "failed"
                          ? "bg-red-500"
                          : node.status === "interrupted"
                            ? "bg-amber-500"
                            : node.status === "running"
                              ? "bg-blue-500"
                              : "bg-emerald-500",
                      )}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{node.status} node</TooltipContent>
              </Tooltip>
              <span className="min-w-0 flex-1 truncate font-mono">
                {node.id}
              </span>
              {node.attempts > 1 && (
                <span className="shrink-0 text-muted-foreground">
                  ×{node.attempts}
                </span>
              )}
              {node.durationMs !== null && (
                <span className="shrink-0 text-muted-foreground">
                  {formatDurationMs(node.durationMs)}
                </span>
              )}
              <Handle
                id={node.id}
                type="source"
                position={Position.Right}
                className="!right-[-9px] !size-1 !border-0 !bg-muted-foreground"
              />
            </div>
          ))
        ) : (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            No node spans captured
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-1 !border-0 !bg-muted-foreground"
      />
    </div>
  );
}
