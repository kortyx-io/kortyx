"use client";

import "@xyflow/react/dist/style.css";

import dagre from "@dagrejs/dagre";
import {
  Background,
  BaseEdge,
  type Edge,
  type EdgeProps,
  getSmoothStepPath,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  Maximize,
  Maximize2,
  Minimize,
  Pause,
  RotateCcw,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatCost,
  formatCount,
  formatDuration,
} from "@/features/workflows/lib/format";
import type {
  WorkflowMetric,
  WorkflowSelection,
  WorkflowViewMode,
} from "@/features/workflows/lib/view-state";
import { toWorkflowGraph } from "@/features/workflows/lib/workflow-graph";
import type {
  WorkflowHealth,
  WorkflowNode,
  WorkflowSummary,
  WorkflowSystem,
} from "@/features/workflows/schema";
import { cn } from "@/lib/utils";
import styles from "./workflow-canvas.module.css";

type LayoutDirection = "LR" | "TB";

type GroupData = {
  workflow: WorkflowSummary;
  selected: boolean;
  mode: WorkflowViewMode;
};
type InternalData = {
  workflow: WorkflowSummary;
  node: WorkflowSummary["nodes"][number];
  selected: boolean;
  mode: WorkflowViewMode;
  metric: WorkflowMetric;
  direction: LayoutDirection;
};
type TransitionData = {
  volume: number;
  condition?: string;
  errorRate?: number;
  successRate?: number;
  medianDurationMs?: number;
  selected: boolean;
  mode: WorkflowViewMode;
  metric: WorkflowMetric;
  routePoints?: Array<{ x: number; y: number }>;
};
type InternalEdgeData = {
  condition?: string;
  routePoints?: Array<{ x: number; y: number }>;
};

const healthClasses: Record<WorkflowHealth, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  failing: "bg-red-500",
  idle: "bg-slate-400",
};
const stateClasses: Record<
  NonNullable<WorkflowSummary["nodes"][number]["state"]>,
  string
> = {
  healthy: "bg-emerald-500",
  warning: "bg-amber-500",
  failed: "bg-red-500",
  interrupted: "bg-blue-500",
  retried: "bg-amber-500",
};

export function WorkflowCanvas({
  system,
  mode,
  metric,
  selection,
  focusedWorkflow,
  onSelect,
}: {
  system: WorkflowSystem;
  mode: WorkflowViewMode;
  metric: WorkflowMetric;
  selection: WorkflowSelection;
  focusedWorkflow?: { id: string; request: number };
  onSelect: (selection: WorkflowSelection) => void;
}) {
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { nodes: layoutNodes, edges } = useMemo(
    () => toWorkflowGraph(system, selection, mode, metric),
    [system, selection, mode, metric],
  );
  const layoutSignature = system.workflows
    .map((workflow) => workflow.id)
    .join(",");
  const focusedBounds = useMemo(() => {
    const group = layoutNodes.find((node) => node.id === focusedWorkflow?.id);
    const width = Number(group?.style?.width ?? 0);
    const height = Number(group?.style?.height ?? 0);
    return group && width && height
      ? { x: group.position.x, y: group.position.y, width, height }
      : undefined;
  }, [focusedWorkflow?.id, layoutNodes]);
  const focusRequest = focusedWorkflow?.request;
  const focusX = focusedBounds?.x;
  const focusY = focusedBounds?.y;
  const focusWidth = focusedBounds?.width;
  const focusHeight = focusedBounds?.height;

  const fit = useCallback(
    () => flow?.fitView({ padding: 0.18, duration: 220, maxZoom: 1.1 }),
    [flow],
  );
  const zoomIn = useCallback(() => flow?.zoomIn({ duration: 160 }), [flow]);
  const zoomOut = useCallback(() => flow?.zoomOut({ duration: 160 }), [flow]);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else canvasRef.current?.requestFullscreen();
  }, []);
  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(document.fullscreenElement === canvasRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  useEffect(() => {
    if (!layoutSignature) return;
    const id = window.setTimeout(fit, 50);
    return () => window.clearTimeout(id);
  }, [layoutSignature, fit]);
  useEffect(() => {
    if (
      !flow ||
      focusRequest === undefined ||
      focusX === undefined ||
      focusY === undefined ||
      focusWidth === undefined ||
      focusHeight === undefined
    )
      return;

    // A group owns the full bounds of its internal nodes and footer. Fitting the
    // calculated bounds avoids relying on React Flow's deferred node measurement.
    const frame = window.requestAnimationFrame(() => {
      flow.fitBounds(
        { x: focusX, y: focusY, width: focusWidth, height: focusHeight },
        { padding: 0.1, duration: 240 },
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flow, focusRequest, focusX, focusY, focusWidth, focusHeight]);

  return (
    <div
      ref={canvasRef}
      className={cn(
        styles.canvas,
        "relative h-full min-h-[500px] bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[16px_16px]",
      )}
    >
      <ReactFlow
        nodes={layoutNodes}
        edges={edges}
        nodeTypes={{ workflow: WorkflowGroup, internal: InternalNode }}
        edgeTypes={{ transition: TransitionEdge, internal: InternalEdge }}
        onInit={setFlow}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
        minZoom={0.25}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => {
          if (node.type === "workflow")
            onSelect({ type: "workflow", id: node.id });
          else {
            const data = node.data as InternalData;
            onSelect({
              type: "node",
              workflowId: data.workflow.id,
              id: data.node.id,
            });
          }
        }}
        onEdgeClick={(_, edge) => {
          if (edge.type === "transition")
            onSelect({ type: "transition", id: edge.id });
        }}
      >
        <Background gap={24} size={1} color="var(--border)" />
      </ReactFlow>
      <div className="absolute right-3 bottom-3 z-10 flex gap-1.5">
        <CanvasControl label="Zoom in" onClick={zoomIn}>
          <ZoomIn />
        </CanvasControl>
        <CanvasControl label="Zoom out" onClick={zoomOut}>
          <ZoomOut />
        </CanvasControl>
        <CanvasControl label="Fit workflow map" onClick={fit}>
          <Maximize2 />
        </CanvasControl>
        <CanvasControl
          label={isFullscreen ? "Exit fullscreen" : "Fullscreen canvas"}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Minimize /> : <Maximize />}
        </CanvasControl>
      </div>
    </div>
  );
}

function CanvasControl({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className="bg-background"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

function WorkflowGroup({ data }: NodeProps<Node<GroupData>>) {
  const { workflow, selected } = data;
  return (
    <div
      className={cn(
        "relative h-full w-full rounded-lg border bg-background shadow-sm transition-shadow",
        selected
          ? "border-foreground/50 ring-1 ring-foreground/20"
          : "border-border",
        "shadow-md",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2 !border-0 !bg-transparent !opacity-0"
      />
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <span
          className={cn("size-2 rounded-full", healthClasses[workflow.health])}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs font-semibold">
            {workflow.name}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {workflow.activeVersion}
          </div>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {formatCount(workflow.metrics.runCount)} runs
        </span>
      </div>
      <div className="pointer-events-none absolute right-3 bottom-2 left-3 flex items-center gap-4 border-t pt-1.5 text-[10px] tabular-nums text-muted-foreground">
        <span>
          p50{" "}
          <b className="ml-1 font-mono font-medium text-foreground">
            {formatDuration(workflow.metrics.p50DurationMs)}
          </b>
        </span>
        <span>
          cost{" "}
          <b className="ml-1 font-mono font-medium text-foreground">
            {formatCost(workflow.metrics.averageCost)}
          </b>
        </span>
        <span>
          interrupt{" "}
          <b className="ml-1 font-mono font-medium text-foreground">
            {workflow.metrics.interruptRate ?? 0}%
          </b>
        </span>
        <span>
          success{" "}
          <b className="ml-1 font-mono font-medium text-foreground">
            {workflow.metrics.successRate ?? 0}%
          </b>
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-0 !bg-transparent !opacity-0"
      />
    </div>
  );
}

function InternalNode({ data }: NodeProps<Node<InternalData>>) {
  const { node, selected, mode, metric, direction } = data;
  const attention =
    node.state === "failed" ||
    node.state === "warning" ||
    node.state === "retried";
  const emphasis =
    mode === "health" &&
    ((metric === "error" && (node.metrics.errorRate ?? 0) > 3) ||
      (metric === "interrupt" && (node.metrics.interruptRate ?? 0) > 10) ||
      (metric === "latency" && (node.metrics.p95DurationMs ?? 0) > 2000));
  return (
    <div
      className={cn(
        "h-full w-full cursor-grab rounded-md border bg-background px-2 py-1.5 shadow-xs active:cursor-grabbing",
        selected
          ? "border-foreground ring-1 ring-foreground/20"
          : emphasis || attention
            ? "border-amber-500/60"
            : "border-border",
      )}
    >
      <Handle
        type="target"
        position={direction === "TB" ? Position.Top : Position.Left}
        className="!size-1.5 !border-0 !bg-transparent !opacity-0"
      />
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "size-1.5 rounded-full",
            stateClasses[node.state ?? "healthy"],
          )}
        />
        {node.state === "interrupted" && (
          <Pause className="size-2.5 text-blue-500" />
        )}
        {node.state === "retried" && (
          <RotateCcw className="size-2.5 text-amber-500" />
        )}
        <span className="whitespace-nowrap font-mono text-[10px] font-medium">
          {node.id}
        </span>
      </div>
      <div className="mt-1 flex gap-2 text-[9px] tabular-nums text-muted-foreground">
        <span>{formatDuration(node.metrics.p50DurationMs)}</span>
        {mode === "health" ? (
          <span>
            {metric === "error"
              ? `${node.metrics.errorRate ?? 0}% err`
              : metric === "cost"
                ? formatCost(node.metrics.averageCost)
                : `${formatCount(node.metrics.runCount)} runs`}
          </span>
        ) : (
          node.metrics.averageCost !== undefined && (
            <span>{formatCost(node.metrics.averageCost)}</span>
          )
        )}
      </div>
      <Handle
        type="source"
        position={direction === "TB" ? Position.Bottom : Position.Right}
        className="!size-1.5 !border-0 !bg-transparent !opacity-0"
      />
    </div>
  );
}

function TransitionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<Edge<TransitionData>>) {
  const [fallbackPath, fallbackLabelX, fallbackLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
    offset: 24,
  });
  const path = data?.routePoints?.length
    ? toPolylinePath(data.routePoints)
    : fallbackPath;
  const routeLabel = data?.routePoints?.length
    ? getEdgeLabelPosition(data.routePoints, data.condition, 104)
    : undefined;
  const [labelX, labelY] = routeLabel
    ? [routeLabel.x, routeLabel.y]
    : [fallbackLabelX, fallbackLabelY];
  const error = (data?.errorRate ?? 0) > 4;
  const width =
    data?.mode === "health" && data.metric === "volume"
      ? Math.min(5, 1.5 + Math.log10(data.volume) / 2)
      : 2;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: error ? "var(--destructive)" : "var(--primary)",
          strokeWidth: width,
          opacity: 0.18,
          strokeLinejoin: "round",
          strokeLinecap: "round",
        }}
      />
      <AnimatedEdgePath
        path={path}
        markerEnd={markerEnd}
        stroke={error ? "var(--destructive)" : "var(--primary)"}
        strokeWidth={width}
        dashArray="9 7"
        offset={-32}
        duration="1s"
        opacity={data?.selected ? 1 : 0.75}
      />
      <g
        transform={`translate(${labelX - 52} ${labelY - 13})`}
        className="pointer-events-none"
      >
        <rect
          width="104"
          height="26"
          rx="4"
          className="fill-background stroke-border"
        />
        <text
          x="52"
          y="11"
          textAnchor="middle"
          className="fill-foreground text-[8px] font-medium"
        >
          {formatCount(data?.volume ?? 0)} handoffs
        </text>
        <text
          x="52"
          y="20"
          textAnchor="middle"
          className={cn(
            "fill-muted-foreground text-[7px]",
            error && "fill-red-500",
          )}
        >
          {data?.condition ?? "transitionTo"}
        </text>
        {error && (
          <TriangleAlert x="92" y="3" className="fill-red-500 text-red-500" />
        )}
      </g>
    </>
  );
}

function InternalEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<Edge<InternalEdgeData>>) {
  const [fallbackPath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 10,
    offset: 20,
  });
  const points = data?.routePoints;
  const path = points?.length ? toPolylinePath(points) : fallbackPath;
  const label = getEdgeLabelPosition(points ?? [], data?.condition);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: "var(--muted-foreground)",
          strokeWidth: 1.15,
          opacity: 0.14,
          strokeLinejoin: "round",
          strokeLinecap: "round",
        }}
      />
      <AnimatedEdgePath
        path={path}
        markerEnd={markerEnd}
        stroke="var(--muted-foreground)"
        strokeWidth={1.15}
        dashArray="4 10"
        offset={-28}
        duration="2.2s"
        opacity={0.58}
      />
      {data?.condition && label && (
        <g
          transform={`translate(${label.x - label.width / 2} ${label.y - 8})`}
          className="pointer-events-none"
        >
          <rect
            width={label.width}
            height="16"
            rx="3"
            className="fill-background stroke-border"
            opacity="0.96"
          />
          <text
            x={label.width / 2}
            y="11"
            textAnchor="middle"
            className="fill-muted-foreground text-[8px]"
          >
            {data.condition}
          </text>
        </g>
      )}
    </>
  );
}

function AnimatedEdgePath({
  path,
  markerEnd,
  stroke,
  strokeWidth,
  dashArray,
  offset,
  duration,
  opacity,
}: {
  path: string;
  markerEnd?: string;
  stroke: string;
  strokeWidth: number;
  dashArray: string;
  offset: number;
  duration: string;
  opacity: number;
}) {
  return (
    <path
      d={path}
      fill="none"
      markerEnd={markerEnd}
      className={cn("react-flow__edge-path", styles.edgeMotion)}
      style={{
        stroke,
        strokeWidth,
        strokeDasharray: dashArray,
        opacity,
        strokeLinejoin: "round",
        strokeLinecap: "round",
      }}
    >
      <animate
        attributeName="stroke-dashoffset"
        from="0"
        to={String(offset)}
        dur={duration}
        repeatCount="indefinite"
      />
    </path>
  );
}

function _toGraph(
  system: WorkflowSystem,
  expanded: string[],
  selection: WorkflowSelection,
  mode: WorkflowViewMode,
  metric: WorkflowMetric,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const internalLayouts = new Map(
    [...system.workflows]
      .sort(compareById)
      .map((workflow) => [
        workflow.id,
        expanded.includes(workflow.id)
          ? layoutInternalWorkflow(workflow)
          : undefined,
      ]),
  );
  const dimensions = new Map(
    [...system.workflows].sort(compareById).map((workflow) => {
      const isExpanded = expanded.includes(workflow.id);
      const internalLayout = internalLayouts.get(workflow.id);
      return [
        workflow.id,
        {
          width: internalLayout?.width ?? (isExpanded ? 660 : 270),
          height:
            internalLayout?.height ??
            (isExpanded ? 260 : mode === "health" ? 146 : 116),
        },
      ];
    }),
  );
  const layout = new dagre.graphlib.Graph({ multigraph: true });
  layout.setDefaultEdgeLabel(() => ({}));
  layout.setGraph({
    rankdir: "LR",
    ranksep: 180,
    nodesep: 150,
    edgesep: 80,
    acyclicer: "greedy",
    ranker: "network-simplex",
  });
  for (const workflow of [...system.workflows].sort(compareById)) {
    const dimension = dimensions.get(workflow.id);
    if (dimension) layout.setNode(workflow.id, dimension);
  }
  for (const transition of [...system.transitions].sort(compareById)) {
    layout.setEdge(
      transition.sourceWorkflowId,
      transition.targetWorkflowId,
      {
        weight: Math.max(1, Math.round(Math.log10(transition.volume))),
      },
      transition.id,
    );
  }
  dagre.layout(layout);

  for (const workflow of [...system.workflows].sort(compareById)) {
    const isExpanded = expanded.includes(workflow.id);
    const { width, height } = dimensions.get(workflow.id) ?? {
      width: 270,
      height: 116,
    };
    const position = layout.node(workflow.id);
    const selected =
      selection.type === "workflow" && selection.id === workflow.id;
    const groupPosition = {
      x: (position?.x ?? width / 2) - width / 2,
      y: (position?.y ?? height / 2) - height / 2,
    };
    nodes.push({
      id: workflow.id,
      type: "workflow",
      position: groupPosition,
      data: { workflow, selected, mode },
      style: { width, height },
      draggable: false,
      zIndex: 0,
    });
    if (isExpanded) {
      const internalLayout = internalLayouts.get(workflow.id);
      [...workflow.nodes].sort(compareById).forEach((node, index) => {
        const position = internalLayout?.positions.get(node.id) ?? {
          x: 18 + index * 126,
          y: 76,
        };
        nodes.push({
          id: `${workflow.id}:${node.id}`,
          type: "internal",
          parentId: workflow.id,
          extent: "parent",
          draggable: false,
          position,
          data: {
            workflow,
            node,
            selected:
              selection.type === "node" &&
              selection.workflowId === workflow.id &&
              selection.id === node.id,
            mode,
            metric,
            direction: internalLayout?.direction ?? "LR",
          },
          style: { width: getInternalNodeWidth(node), height: 54 },
          zIndex: 2,
        });
      });
      for (const edge of [...workflow.internalEdges].sort(compareById)) {
        const routePoints = internalLayout?.routes
          .get(edge.id)
          ?.map((point: { x: number; y: number }) => ({
            x: point.x + groupPosition.x,
            y: point.y + groupPosition.y,
          }));
        edges.push({
          id: edge.id,
          type: "internal",
          source: `${workflow.id}:${edge.source}`,
          target: `${workflow.id}:${edge.target}`,
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
          data: { condition: edge.condition, routePoints },
          zIndex: 1,
        });
      }
    }
  }
  for (const transition of [...system.transitions].sort(compareById))
    edges.push({
      id: transition.id,
      type: "transition",
      source: transition.sourceWorkflowId,
      target: transition.targetWorkflowId,
      data: {
        ...transition,
        selected:
          selection.type === "transition" && selection.id === transition.id,
        mode,
        metric,
        routePoints: layout.edge({
          v: transition.sourceWorkflowId,
          w: transition.targetWorkflowId,
          name: transition.id,
        })?.points,
      },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      zIndex: 0,
    });
  return { nodes, edges };
}

function toPolylinePath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function getEdgeLabelPosition(
  points: Array<{ x: number; y: number }>,
  condition?: string,
  minimumWidth = 34,
) {
  if (points.length < 2) return undefined;
  const segments = points.slice(1).map((point, index) => {
    const start = points[index];
    return {
      start,
      end: point,
      horizontal: Math.abs(point.x - start.x) >= Math.abs(point.y - start.y),
      length: Math.hypot(point.x - start.x, point.y - start.y),
    };
  });
  const horizontalSegments = segments.filter((segment) => segment.horizontal);
  const segment = (
    horizontalSegments.length ? horizontalSegments : segments
  ).reduce((longest, current) =>
    current.length > longest.length ? current : longest,
  );
  const textWidth = Math.min(
    132,
    Math.max(minimumWidth, (condition?.length ?? 0) * 5.4 + 14),
  );
  // Keeping the label offset off the route makes it legible without obscuring
  // arrowheads or sitting on top of an internal node.
  const midpoint = {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
  return {
    x: midpoint.x + (segment.horizontal ? 0 : 12),
    y: midpoint.y + (segment.horizontal ? -12 : 0),
    width: textWidth,
  };
}

function layoutInternalWorkflow(workflow: WorkflowSummary) {
  const nodeHeight = 54;
  const offsetX = 18;
  const offsetY = 76;
  const footerHeight = 42;
  const layout = new dagre.graphlib.Graph({ multigraph: true });
  layout.setDefaultEdgeLabel(() => ({}));
  const layoutOptions = (rankdir: LayoutDirection) => ({
    rankdir,
    ranksep: rankdir === "TB" ? 56 : 92,
    nodesep: 80,
    edgesep: 64,
    acyclicer: "greedy",
    ranker: "network-simplex",
  });
  layout.setGraph(layoutOptions("LR"));
  for (const node of [...workflow.nodes].sort(compareById)) {
    layout.setNode(node.id, {
      width: getInternalNodeWidth(node),
      height: nodeHeight,
    });
  }
  for (const edge of [...workflow.internalEdges].sort(compareById)) {
    layout.setEdge(edge.source, edge.target, {}, edge.id);
  }
  dagre.layout(layout);

  // A long linear chain is more legible when it uses the canvas height than
  // when six or more cards force the focused viewport to zoom far out.
  const lrBounds = layout.graph();
  const direction: LayoutDirection =
    lrBounds.width > lrBounds.height * 1.6 ? "TB" : "LR";
  if (direction === "TB") {
    layout.setGraph(layoutOptions(direction));
    dagre.layout(layout);
  }

  const positions = new Map(
    [...workflow.nodes].sort(compareById).map((node) => {
      const point = layout.node(node.id);
      const width = getInternalNodeWidth(node);
      return [
        node.id,
        {
          x: Math.round((point?.x ?? width / 2) - width / 2 + offsetX),
          y: Math.round(
            (point?.y ?? nodeHeight / 2) - nodeHeight / 2 + offsetY,
          ),
        },
      ];
    }),
  );
  const maxX = Math.max(
    ...workflow.nodes.map(
      (node) =>
        (positions.get(node.id)?.x ?? offsetX) + getInternalNodeWidth(node),
    ),
  );
  const maxY = Math.max(
    ...[...positions.values()].map((position) => position.y + nodeHeight),
  );
  return {
    direction,
    positions,
    routes: new Map(
      [...workflow.internalEdges].sort(compareById).map((edge) => [
        edge.id,
        (
          layout.edge({ v: edge.source, w: edge.target, name: edge.id })
            ?.points ?? []
        ).map((point: { x: number; y: number }) => ({
          x: Math.round(point.x + offsetX),
          y: Math.round(point.y + offsetY),
        })),
      ]),
    ),
    width: Math.max(420, maxX + 28),
    height: Math.max(280, maxY + footerHeight + 12),
  };
}

function compareById<T extends { id: string }>(a: T, b: T) {
  return a.id.localeCompare(b.id);
}

function getInternalNodeWidth(node: WorkflowNode) {
  return Math.min(250, Math.max(118, node.id.length * 6.4 + 34));
}
