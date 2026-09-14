import dagre from "@dagrejs/dagre";
import { type Edge, MarkerType, type Node } from "@xyflow/react";
import type { WorkflowNode, WorkflowSummary, WorkflowSystem } from "../schema";
import { CONNECTION_STYLE } from "./connection-style";
import { type EdgeLabel, placeEdgeLabels } from "./edge-label-layout";
import { routeAroundNodes } from "./edge-routing";
import type {
  WorkflowMetric,
  WorkflowSelection,
  WorkflowViewMode,
} from "./view-state";

type LayoutDirection = "LR" | "TB";

export type { EdgeLabel } from "./edge-label-layout";

export function conditionLabelWidth(condition: string) {
  return Math.min(260, Math.max(44, condition.length * 5.4 + 20));
}

function edgeLabel(edge: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}): EdgeLabel | undefined {
  return edge.x !== undefined &&
    edge.y !== undefined &&
    edge.width &&
    edge.height
    ? { x: edge.x, y: edge.y, width: edge.width, height: edge.height }
    : undefined;
}

export function toWorkflowGraph(
  system: WorkflowSystem,
  selection: WorkflowSelection,
  mode: WorkflowViewMode,
  metric: WorkflowMetric,
): { nodes: Node[]; edges: Edge[] } {
  // Stable ordering keeps refreshes and metric changes from rearranging the map.
  system = {
    ...system,
    workflows: [...system.workflows].sort((a, b) => a.id.localeCompare(b.id)),
    transitions: [...system.transitions].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  };
  const internalLayouts = new Map(
    system.workflows.map((workflow) => [
      workflow.id,
      layoutInternalWorkflow(workflow),
    ]),
  );
  const dimensions = new Map(
    system.workflows.map((workflow) => {
      const internal = internalLayouts.get(workflow.id);
      return [
        workflow.id,
        {
          width: internal?.width ?? 660,
          height: internal?.height ?? (mode === "health" ? 146 : 116),
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
  for (const workflow of system.workflows)
    layout.setNode(workflow.id, dimensions.get(workflow.id));
  for (const transition of system.transitions)
    layout.setEdge(
      transition.sourceWorkflowId,
      transition.targetWorkflowId,
      { weight: 1, width: 144, height: 36, labelpos: "r", labeloffset: 18 },
      transition.id,
    );
  dagre.layout(layout);

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  for (const workflow of system.workflows) {
    const { width, height } = dimensions.get(workflow.id) ?? {
      width: 660,
      height: 260,
    };
    const position = layout.node(workflow.id);
    const groupPosition = {
      x: (position?.x ?? width / 2) - width / 2,
      y: (position?.y ?? height / 2) - height / 2,
    };
    const internal = internalLayouts.get(workflow.id);
    nodes.push({
      id: workflow.id,
      type: "workflow",
      position: groupPosition,
      data: {
        workflow,
        selected: selection.type === "workflow" && selection.id === workflow.id,
        mode,
      },
      style: { width, height },
      draggable: false,
      zIndex: 0,
    });
    for (const node of workflow.nodes) {
      const nodePosition = internal?.positions.get(node.id) ?? { x: 18, y: 76 };
      nodes.push({
        id: `${workflow.id}:${node.id}`,
        type: "internal",
        parentId: workflow.id,
        extent: "parent",
        draggable: false,
        position: nodePosition,
        data: {
          workflow,
          node,
          selected:
            selection.type === "node" &&
            selection.workflowId === workflow.id &&
            selection.id === node.id,
          mode,
          metric,
          direction: internal?.direction ?? "LR",
        },
        style: { width: getInternalNodeWidth(node), height: 54 },
        zIndex: 2,
      });
    }
    for (const edge of workflow.internalEdges) {
      const routePoints = internal?.routes
        .get(edge.id)
        ?.map((point: { x: number; y: number }) => ({
          x: point.x + groupPosition.x,
          y: point.y + groupPosition.y,
        }));
      const label = internal?.labels.get(edge.id);
      edges.push({
        id: `${workflow.id}:${edge.id}`,
        type: "internal",
        source: `${workflow.id}:${edge.source}`,
        target: `${workflow.id}:${edge.target}`,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: "var(--muted-foreground)",
        },
        data: {
          condition: edge.condition,
          routePoints,
          label: label
            ? {
                ...label,
                x: label.x + groupPosition.x,
                y: label.y + groupPosition.y,
              }
            : undefined,
        },
        zIndex: 1,
      });
    }
  }
  for (const transition of system.transitions)
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
        label: edgeLabel(
          layout.edge({
            v: transition.sourceWorkflowId,
            w: transition.targetWorkflowId,
            name: transition.id,
          }),
        ),
        routePoints: layout.edge({
          v: transition.sourceWorkflowId,
          w: transition.targetWorkflowId,
          name: transition.id,
        })?.points,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color:
          CONNECTION_STYLE[transition.kind === "call" ? "call" : "handoff"]
            .color,
      },
      zIndex: 1,
    });
  const groupObstacles = nodes
    .filter((node) => !node.parentId)
    .map((node) => ({
      id: node.id,
      ...node.position,
      width: Number(node.style?.width),
      height: Number(node.style?.height),
    }));
  edges
    .filter((edge) => edge.type === "transition")
    .forEach((edge, index) => {
      if (edge.data)
        edge.data.routePoints = routeAroundNodes(
          edge.data.routePoints as Array<{ x: number; y: number }>,
          groupObstacles,
          edge.source,
          edge.target,
          14 + (index % 8) * 6,
        );
    });
  const transitionLabels = placeEdgeLabels(
    edges
      .filter((edge) => edge.type === "transition")
      .map((edge) => ({
        id: edge.id,
        points: edge.data?.routePoints as Array<{ x: number; y: number }>,
        label: edge.data?.label as EdgeLabel | undefined,
      })),
    nodes
      .filter((node) => !node.parentId)
      .map((node) => ({
        ...node.position,
        width: Number(node.style?.width),
        height: Number(node.style?.height),
      })),
  );
  for (const edge of edges) {
    if (edge.type === "transition" && edge.data)
      edge.data.label = transitionLabels.get(edge.id);
  }
  return { nodes, edges };
}

function layoutInternalWorkflow(workflow: WorkflowSummary) {
  workflow = {
    ...workflow,
    nodes: [...workflow.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    internalEdges: [...workflow.internalEdges].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  };
  const nodeHeight = 54;
  const offsetX = 18;
  const offsetY = 76;
  const layout = new dagre.graphlib.Graph({ multigraph: true });
  layout.setDefaultEdgeLabel(() => ({}));
  const options = (rankdir: LayoutDirection) => ({
    rankdir,
    ranksep: rankdir === "TB" ? 56 : 92,
    nodesep: 80,
    edgesep: 64,
    acyclicer: "greedy",
    ranker: "network-simplex",
  });
  layout.setGraph(options("LR"));
  for (const node of workflow.nodes)
    layout.setNode(node.id, {
      width: getInternalNodeWidth(node),
      height: nodeHeight,
    });
  for (const edge of workflow.internalEdges)
    layout.setEdge(
      edge.source,
      edge.target,
      edge.condition
        ? {
            width: conditionLabelWidth(edge.condition),
            height: 20,
            labelpos: "r",
            labeloffset: 14,
          }
        : {},
      edge.id,
    );
  dagre.layout(layout);
  const direction: LayoutDirection =
    layout.graph().width > layout.graph().height * 1.6 ? "TB" : "LR";
  if (direction === "TB") {
    layout.setGraph(options(direction));
    dagre.layout(layout);
  }
  const positions = new Map(
    workflow.nodes.map((node) => {
      const point = layout.node(node.id);
      const width = getInternalNodeWidth(node);
      return [
        node.id,
        {
          x: (point?.x ?? width / 2) - width / 2 + offsetX,
          y: (point?.y ?? nodeHeight / 2) - nodeHeight / 2 + offsetY,
        },
      ];
    }),
  );
  const maxX = Math.max(
    offsetX + (layout.graph().width || 0),
    ...workflow.nodes.map(
      (node) =>
        (positions.get(node.id)?.x ?? offsetX) + getInternalNodeWidth(node),
    ),
  );
  const maxY = Math.max(
    offsetY + (layout.graph().height || 0),
    ...[...positions.values()].map((position) => position.y + nodeHeight),
  );
  const result = {
    direction,
    positions,
    labels: new Map(
      workflow.internalEdges.map((edge) => {
        const label = edgeLabel(
          layout.edge({ v: edge.source, w: edge.target, name: edge.id }),
        );
        return [
          edge.id,
          label
            ? { ...label, x: label.x + offsetX, y: label.y + offsetY }
            : undefined,
        ];
      }),
    ),
    routes: new Map(
      workflow.internalEdges.map((edge) => [
        edge.id,
        (
          layout.edge({ v: edge.source, w: edge.target, name: edge.id })
            ?.points ?? []
        ).map((point: { x: number; y: number }) => ({
          x: point.x + offsetX,
          y: point.y + offsetY,
        })),
      ]),
    ),
    width: Math.max(420, maxX + 28),
    height: Math.max(280, maxY + 54),
  };
  const internalObstacles = workflow.nodes.map((node) => ({
    id: node.id,
    ...(positions.get(node.id) ?? { x: offsetX, y: offsetY }),
    width: getInternalNodeWidth(node),
    height: nodeHeight,
  }));
  for (const edge of workflow.internalEdges) {
    result.routes.set(
      edge.id,
      routeAroundNodes(
        result.routes.get(edge.id) ?? [],
        internalObstacles,
        edge.source,
        edge.target,
      ),
    );
  }
  result.labels = placeEdgeLabels(
    workflow.internalEdges.map((edge) => ({
      id: edge.id,
      points: result.routes.get(edge.id) ?? [],
      label: result.labels.get(edge.id),
    })),
    workflow.nodes.map((node) => ({
      ...(positions.get(node.id) ?? { x: offsetX, y: offsetY }),
      width: getInternalNodeWidth(node),
      height: nodeHeight,
    })),
    { x: offsetX, y: offsetY },
  );
  for (const label of result.labels.values()) {
    if (!label) continue;
    result.width = Math.max(result.width, label.x + label.width / 2 + 28);
    result.height = Math.max(result.height, label.y + label.height / 2 + 54);
  }
  return result;
}

function getInternalNodeWidth(node: WorkflowNode) {
  return Math.min(250, Math.max(118, node.id.length * 6.4 + 34));
}
