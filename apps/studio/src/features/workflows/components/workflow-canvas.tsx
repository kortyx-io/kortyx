"use client";

import { studioDetailHref } from "@/lib/studio-routes";

import "@xyflow/react/dist/style.css";

import {
  Background,
  BaseEdge,
  type Edge,
  type EdgeProps,
  getSmoothStepPath,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import {
  Maximize,
  Maximize2,
  Minimize,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatRate,
  getTransitionStrokeWidth,
} from "@/features/workflows/lib/format";
import type {
  WorkflowMetric,
  WorkflowSelection,
  WorkflowViewMode,
} from "@/features/workflows/lib/view-state";
import {
  type EdgeLabel,
  toWorkflowGraph,
} from "@/features/workflows/lib/workflow-graph";
import type {
  WorkflowSummary,
  WorkflowSystem,
} from "@/features/workflows/schema";
import { formatCount, formatCurrency, formatDurationMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CONNECTION_STYLE } from "../lib/connection-style";
import {
  loadWorkflowViewport,
  saveWorkflowViewport,
  workflowViewportKey,
} from "../lib/viewport-state";
import { sameWorkflowCall } from "../lib/workflow-calls";
import styles from "./workflow-canvas.module.css";
import {
  NodeStatusIndicator,
  WorkflowHealthIndicator,
} from "./workflow-status-indicator";

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
type BoundaryData = {
  boundary: "start" | "end";
  direction: LayoutDirection;
};
type TransitionData = {
  kind?: "call" | "handoff";
  volume: number;
  condition?: string;
  errorRate?: number;
  successRate?: number;
  medianDurationMs?: number;
  selected: boolean;
  mode: WorkflowViewMode;
  metric: WorkflowMetric;
  routePoints?: Array<{ x: number; y: number }>;
  label?: EdgeLabel;
};
type InternalEdgeData = {
  condition?: string;
  routePoints?: Array<{ x: number; y: number }>;
  label?: EdgeLabel;
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
  focusedWorkflow?: {
    id: string;
    request: number;
    sourceKey: string;
    animate?: boolean;
  };
  onSelect: (selection: WorkflowSelection) => void;
}) {
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  // Metric refreshes replace API objects. Cache by topology so navigation never
  // reruns collision detection and blocks the camera animation.
  const topologyKey = JSON.stringify({
    workflows: system.workflows.map(({ id, nodes, internalEdges }) => ({
      id,
      nodes: nodes.map(({ id }) => id),
      internalEdges,
    })),
    transitions: system.transitions.map(
      ({ id, sourceWorkflowId, targetWorkflowId, condition, kind }) => ({
        id,
        sourceWorkflowId,
        targetWorkflowId,
        condition,
        kind,
      }),
    ),
  });
  const graphCache = useRef<{
    key: string;
    graph: ReturnType<typeof toWorkflowGraph>;
  } | null>(null);
  if (graphCache.current?.key !== topologyKey) {
    graphCache.current = {
      key: topologyKey,
      graph: toWorkflowGraph(
        system,
        { type: "workflow", id: "" },
        "system",
        "volume",
      ),
    };
  }
  const graph = graphCache.current.graph;
  const { nodes: layoutNodes, edges } = useMemo(
    () => ({
      nodes: graph.nodes.map((node) => {
        const workflow = system.workflows.find(
          (item) => item.id === (node.parentId ?? node.id),
        );
        return {
          ...node,
          data: {
            ...node.data,
            workflow,
            mode,
            metric,
            ...(node.type === "internal"
              ? {
                  node: workflow?.nodes.find(
                    (item) => `${workflow.id}:${item.id}` === node.id,
                  ),
                }
              : {}),
            selected:
              node.type === "workflow"
                ? selection.type === "workflow" && selection.id === node.id
                : selection.type === "node" &&
                  `${selection.workflowId}:${selection.id}` === node.id,
          },
        };
      }),
      edges: graph.edges.map((edge) => ({
        ...edge,
        data: {
          ...edge.data,
          ...system.transitions.find((item) => item.id === edge.id),
          mode,
          metric,
          selected: selection.type === "transition" && selection.id === edge.id,
        },
      })),
    }),
    [graph, system, selection, mode, metric],
  );
  // Refs survive Next's hidden Activity boundary when returning with Back.
  // Keep the last visible viewport instead of fitting the entire graph again.
  const savedViewport = useRef<{ key: string; viewport: Viewport } | null>(
    null,
  );
  const focusedBounds = useMemo(() => {
    const group = layoutNodes.find((node) => node.id === focusedWorkflow?.id);
    const width = Number(group?.style?.width ?? 0);
    const height = Number(group?.style?.height ?? 0);
    return group && width && height
      ? { x: group.position.x, y: group.position.y, width, height }
      : undefined;
  }, [focusedWorkflow?.id, layoutNodes]);
  const focusKey = focusedWorkflow?.sourceKey;
  const focusRequest = focusedWorkflow?.request;
  const animateFocus = focusedWorkflow?.animate;
  const focusX = focusedBounds?.x;
  const focusY = focusedBounds?.y;
  const focusWidth = focusedBounds?.width;
  const focusHeight = focusedBounds?.height;
  const viewportSelection = [
    "layout-v2",
    focusKey ?? "overview",
    focusX,
    focusY,
    focusWidth,
    focusHeight,
    layoutNodes.length,
  ].join(":");

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: repeated catalog clicks must refocus the same workflow.
  useEffect(() => {
    if (!flow || !layoutNodes.length) return;
    const element = canvasRef.current;
    if (!element) return;
    let frame = 0;
    let restored = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const navigationSettlesAt = performance.now() + 1000;
    const restore = () => {
      if (restored || !element.clientWidth || !element.clientHeight) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!element.clientWidth || !element.clientHeight) return;
        restored = true;
        const key = workflowViewportKey(viewportSelection);
        const saved =
          savedViewport.current?.key === key
            ? savedViewport.current.viewport
            : loadWorkflowViewport(key);
        const duration =
          animateFocus &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 450
            : 0;
        if (saved && !animateFocus) {
          void flow.setViewport(saved, { duration: 0 });
        } else if (
          focusX !== undefined &&
          focusY !== undefined &&
          focusWidth !== undefined &&
          focusHeight !== undefined
        ) {
          void flow.fitBounds(
            { x: focusX, y: focusY, width: focusWidth, height: focusHeight },
            { padding: 0.1, duration },
          );
        } else {
          void flow.fitView({ padding: 0.18, maxZoom: 1.1, duration: 0 });
        }
      });
    };
    // A cached route can reactivate before its container has a nonzero size.
    const observer = new ResizeObserver(() => {
      if (!restored) {
        restore();
        return;
      }
      // Opening the inspector changes the available width during navigation.
      // Refit after its width transition, so the destination is fully visible.
      if (!animateFocus || performance.now() > navigationSettlesAt) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        restored = false;
        restore();
      }, 80);
    });
    observer.observe(element);
    const onPageShow = () => {
      restored = false;
      restore();
    };
    window.addEventListener("pageshow", onPageShow);
    restore();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
      observer.disconnect();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [
    flow,
    viewportSelection,
    focusRequest,
    animateFocus,
    layoutNodes.length,
    focusX,
    focusY,
    focusWidth,
    focusHeight,
  ]);

  return (
    <div
      ref={canvasRef}
      className={cn(
        styles.canvas,
        "relative h-full min-h-[500px] bg-background",
      )}
    >
      <ReactFlow
        nodes={layoutNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={setFlow}
        onMoveEnd={(_, viewport) => {
          if (
            canvasRef.current?.clientWidth &&
            canvasRef.current?.clientHeight
          ) {
            if (window.location.pathname !== "/workflows") return;
            const key = workflowViewportKey(viewportSelection);
            savedViewport.current = { key, viewport };
            saveWorkflowViewport(key, viewport);
          }
        }}
        minZoom={0.04}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => {
          if (node.type === "workflow")
            onSelect({ type: "workflow", id: node.id });
          else if (node.type === "internal") {
            const data = node.data as InternalData;
            onSelect({
              type: "node",
              workflowId: data.workflow.id,
              id: data.node.id,
            });
          }
        }}
        onEdgeClick={(_, edge) => {
          const path = system.transitions.find((path) => path.id === edge.id);
          const call = system.observedCalls?.find(
            (call) =>
              call.id === edge.id ||
              (path?.kind === "call" && sameWorkflowCall(path, call)),
          );
          if (call) {
            window.location.href = studioDetailHref("runs", call.runId, {
              tab: "calls",
              call: call.invocationId,
              branch: call.branchId,
            });
            return;
          }
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
        <WorkflowHealthIndicator health={workflow.health} />
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
            {formatDurationMs(workflow.metrics.p50DurationMs)}
          </b>
        </span>
        <span>
          cost{" "}
          <b className="ml-1 font-mono font-medium text-foreground">
            {formatCurrency(workflow.metrics.averageCost)}
          </b>
        </span>
        <span>
          interrupt{" "}
          <b className="ml-1 font-mono font-medium text-foreground">
            {formatRate(workflow.metrics.interruptRate)}
          </b>
        </span>
        <span>
          success{" "}
          <b className="ml-1 font-mono font-medium text-foreground">
            {formatRate(workflow.metrics.successRate)}
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

function BoundaryNode({ data }: NodeProps<Node<BoundaryData>>) {
  const start = data.boundary === "start";
  return (
    <div
      title={start ? "Workflow start" : "Workflow end"}
      className="flex h-full w-full items-center justify-center gap-1.5 rounded-full border border-border bg-background text-[10px] font-medium text-muted-foreground"
    >
      {!start && (
        <Handle
          type="target"
          position={data.direction === "TB" ? Position.Top : Position.Left}
          className="!size-1.5 !border-0 !bg-transparent !opacity-0"
        />
      )}
      <span
        className={cn(
          "size-1.5 rounded-full",
          start ? "bg-muted-foreground" : "border border-muted-foreground",
        )}
      />
      {start ? "Start" : "End"}
      {start && (
        <Handle
          type="source"
          position={data.direction === "TB" ? Position.Bottom : Position.Right}
          className="!size-1.5 !border-0 !bg-transparent !opacity-0"
        />
      )}
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
        <NodeStatusIndicator state={node.state} />
        <span
          title={node.id}
          className="min-w-0 truncate font-mono text-[10px] font-medium"
        >
          {node.id}
        </span>
        {node.tools?.length ? (
          <span
            className="ml-auto shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground"
            title={node.tools.map((tool) => tool.name).join(", ")}
            role="note"
            aria-label={`${node.tools.length} attached tools`}
          >
            {node.tools.length} tools
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex gap-2 text-[9px] tabular-nums text-muted-foreground">
        <span>{formatDurationMs(node.metrics.p50DurationMs)}</span>
        {mode === "health" ? (
          <span>
            {metric === "error"
              ? `${formatRate(node.metrics.errorRate)} err`
              : metric === "cost"
                ? formatCurrency(node.metrics.averageCost)
                : `${formatCount(node.metrics.runCount)} runs`}
          </span>
        ) : (
          node.metrics.averageCost !== undefined && (
            <span>{formatCurrency(node.metrics.averageCost)}</span>
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
  const routeLabel = data?.label;
  const [labelX, labelY] = routeLabel
    ? [routeLabel.x, routeLabel.y]
    : [fallbackLabelX, fallbackLabelY - 36];
  const labelWidth = routeLabel?.width ?? 144;
  const labelHeight = routeLabel?.height ?? 36;
  const origin = data?.routePoints?.[0] ?? { x: sourceX, y: sourceY };
  const isCall = data?.kind === "call" || id.startsWith("observed-call:");
  const connectionStyle = CONNECTION_STYLE[isCall ? "call" : "handoff"];
  const error = (data?.errorRate ?? 0) > 4;
  const width = getTransitionStrokeWidth(
    data?.mode,
    data?.metric,
    data?.volume,
  );
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: connectionStyle.color,
          strokeWidth: width,
          opacity: 0.18,
          strokeLinejoin: "round",
          strokeLinecap: "round",
        }}
      />
      <AnimatedEdgePath
        path={path}
        markerEnd={markerEnd}
        stroke={connectionStyle.color}
        strokeWidth={width}
        dashArray={connectionStyle.dashArray}
        offset={-32}
        duration="1s"
        opacity={data?.selected ? 1 : 0.75}
      />
      <circle
        cx={origin.x}
        cy={origin.y}
        r={4}
        fill={connectionStyle.color}
        stroke={connectionStyle.color}
        strokeWidth={1.8}
        className="pointer-events-none"
      />
      <g
        data-edge-label={id}
        transform={`translate(${labelX - labelWidth / 2} ${labelY - labelHeight / 2})`}
        className="cursor-pointer"
      >
        <title>{`${formatCount(data?.volume ?? 0)} ${isCall ? "calls" : "handoffs"} · ${isCall ? "call → return" : truncateLabel(data?.condition ?? "transitionTo", labelWidth)}${error ? ` · Warning: ${formatRate(data?.errorRate)} error rate` : ""}`}</title>
        <rect
          width={labelWidth}
          height={labelHeight}
          rx="4"
          className="fill-background stroke-border"
        />
        <text
          x={labelWidth / 2}
          y="14"
          textAnchor="middle"
          className="fill-foreground text-[10px] font-medium"
        >
          {formatCount(data?.volume ?? 0)} {isCall ? "calls" : "handoffs"}
        </text>
        <text
          x={labelWidth / 2}
          y="27"
          textAnchor="middle"
          className={cn(
            "fill-muted-foreground text-[9px]",
            error && "fill-red-500",
          )}
        >
          {isCall
            ? "call → return"
            : truncateLabel(data?.condition ?? "transitionTo", labelWidth)}
        </text>
        {error && (
          <TriangleAlert
            x={labelWidth - 14}
            y="3"
            width="10"
            height="10"
            className="fill-red-500 text-red-500"
          />
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
  const label = data?.label;
  const origin = points?.[0] ?? { x: sourceX, y: sourceY };

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
        opacity={0.8}
      />
      <circle
        cx={origin.x}
        cy={origin.y}
        r={3}
        fill="var(--muted-foreground)"
        stroke="var(--muted-foreground)"
        strokeWidth={1.4}
        className="pointer-events-none"
      />
      {data?.condition && label && (
        <g
          data-edge-label={id}
          transform={`translate(${label.x - label.width / 2} ${label.y - label.height / 2})`}
          className="pointer-events-none"
        >
          <title>{data.condition}</title>
          <rect
            width={label.width}
            height={label.height}
            rx="3"
            className="fill-background stroke-border"
            opacity="0.96"
          />
          <text
            x={label.width / 2}
            y="14"
            textAnchor="middle"
            className="fill-muted-foreground text-[9px]"
          >
            {truncateLabel(data.condition, label.width)}
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
      style={
        {
          stroke,
          strokeWidth,
          strokeDasharray: dashArray,
          opacity,
          strokeLinejoin: "round",
          strokeLinecap: "round",
          "--edge-offset": offset,
          "--edge-duration": duration,
        } as CSSProperties
      }
    />
  );
}

function toPolylinePath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function truncateLabel(text: string, width: number) {
  const limit = Math.floor((width - 20) / 5.4);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

const nodeTypes = {
  workflow: WorkflowGroup,
  internal: InternalNode,
  boundary: BoundaryNode,
};
const edgeTypes = { transition: TransitionEdge, internal: InternalEdge };
