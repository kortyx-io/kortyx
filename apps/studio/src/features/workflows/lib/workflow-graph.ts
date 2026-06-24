import dagre from "@dagrejs/dagre";
import { type Edge, MarkerType, type Node } from "@xyflow/react";
import type { WorkflowNode, WorkflowSummary, WorkflowSystem } from "../schema";
import type {
  WorkflowMetric,
  WorkflowSelection,
  WorkflowViewMode,
} from "./view-state";

type LayoutDirection = "LR" | "TB";

export function toWorkflowGraph(
  system: WorkflowSystem,
  selection: WorkflowSelection,
  mode: WorkflowViewMode,
  metric: WorkflowMetric,
): { nodes: Node[]; edges: Edge[] } {
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
      { weight: Math.max(1, Math.round(Math.log10(transition.volume))) },
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

function layoutInternalWorkflow(workflow: WorkflowSummary) {
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
    layout.setEdge(edge.source, edge.target, {}, edge.id);
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
      workflow.internalEdges.map((edge) => [
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
    height: Math.max(280, maxY + 54),
  };
}

function getInternalNodeWidth(node: WorkflowNode) {
  return Math.min(250, Math.max(118, node.id.length * 6.4 + 34));
}
