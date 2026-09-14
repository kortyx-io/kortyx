import { describe, expect, it } from "vitest";
import type { WorkflowSummary, WorkflowSystem } from "../schema";
import {
  type EdgeLabel,
  type Point,
  rectanglesOverlap,
  segmentIntersectsRectangle,
} from "./edge-label-layout";
import { routeAroundNodes } from "./edge-routing";
import { toWorkflowGraph } from "./workflow-graph";

function workflow(id: string): WorkflowSummary {
  return {
    id,
    name: id,
    versions: ["1"],
    activeVersion: "1",
    health: "unknown",
    metrics: { runCount: 0 },
    nodes: ["enter", "goal", "reason", "verify"].map((id) => ({
      id,
      label: id,
      metrics: { runCount: 0 },
    })),
    internalEdges: [
      { id: "goal", source: "enter", target: "goal", condition: "goal" },
      {
        id: "preview",
        source: "enter",
        target: "reason",
        condition: "preview",
      },
      { id: "verify", source: "reason", target: "verify" },
    ],
  };
}
function system(): WorkflowSystem {
  const parent = workflow("orchestrator");
  parent.internalEdges.push({
    id: "retry",
    source: "verify",
    target: "reason",
    condition: "retry after validation",
  });
  return {
    workflows: [parent, ...["a", "b", "c", "d", "e", "isolated"].map(workflow)],
    transitions: ["a", "b", "c", "d", "e"].flatMap((target) =>
      ["attempt", "delegate"].map((source) => ({
        id: `${source}:${target}`,
        sourceWorkflowId: "orchestrator",
        targetWorkflowId: target,
        sourceNodeId: source,
        volume: 0,
        kind: "call" as const,
      })),
    ),
    cohort: {
      range: "All time",
      startedAfter: "",
      startedBefore: "",
      timezone: "UTC",
    } as WorkflowSystem["cohort"],
  };
}
const selection = { type: "workflow" as const, id: "orchestrator" };
function graph(value = system()) {
  return toWorkflowGraph(value, selection, "system", "volume");
}

describe("automatic workflow layout", () => {
  it("keeps labels clear of every route, card and other label in a dense multigraph", () => {
    const { nodes, edges } = graph();
    const boxes = nodes.map((node) => {
      const parent = nodes.find((item) => item.id === node.parentId);
      return {
        id: node.id,
        parentId: node.parentId,
        x: node.position.x + (parent?.position.x ?? 0),
        y: node.position.y + (parent?.position.y ?? 0),
        width: Number(node.style?.width),
        height: Number(node.style?.height),
      };
    });
    const labels = edges.flatMap((edge) => {
      const label = edge.data?.label as EdgeLabel | undefined;
      return label
        ? [
            {
              edge,
              rect: {
                ...label,
                x: label.x - label.width / 2,
                y: label.y - label.height / 2,
              },
            },
          ]
        : [];
    });
    expect(labels.length).toBeGreaterThan(20);
    for (const [index, { edge, rect }] of labels.entries()) {
      for (const other of edges) {
        const points = other.data?.routePoints as Point[];
        for (let i = 1; i < points.length; i++)
          expect(
            segmentIntersectsRectangle(points[i - 1], points[i], rect),
            `${edge.id} label clips ${other.id}`,
          ).toBe(false);
      }
      for (const box of boxes) {
        if (edge.type === "internal" && !box.parentId) continue;
        expect(
          rectanglesOverlap(rect, box),
          `${edge.id} label overlaps ${box.id}`,
        ).toBe(false);
      }
      for (const other of labels.slice(index + 1))
        expect(rectanglesOverlap(rect, other.rect)).toBe(false);
    }
  });

  it("detours around unrelated boxes while preserving source and target endpoints", () => {
    const points = [
      { x: 20, y: 50 },
      { x: 100, y: 50 },
      { x: 200, y: 50 },
    ];
    const obstacle = { id: "obstacle", x: 80, y: 20, width: 40, height: 60 };
    const routed = routeAroundNodes(points, [obstacle], "source", "target");
    expect(routed[0]).toEqual(points[0]);
    expect(routed.at(-1)).toEqual(points.at(-1));
    for (let i = 1; i < routed.length; i++)
      expect(
        segmentIntersectsRectangle(routed[i - 1], routed[i], obstacle),
      ).toBe(false);
  });

  it("keeps layout stable across selection, health metrics, traffic and input order", () => {
    const original = system();
    const changed = {
      ...original,
      workflows: [...original.workflows].reverse(),
      transitions: [...original.transitions]
        .reverse()
        .map((edge) => ({ ...edge, volume: 10000 })),
    };
    const a = graph(original);
    const b = toWorkflowGraph(
      changed,
      { type: "workflow", id: "a" },
      "health",
      "error",
    );
    expect(
      b.nodes.map(({ id, position, style }) => ({ id, position, style })),
    ).toEqual(
      a.nodes.map(({ id, position, style }) => ({ id, position, style })),
    );
    expect(b.edges.map((edge) => edge.data?.routePoints)).toEqual(
      a.edges.map((edge) => edge.data?.routePoints),
    );
  });

  it("contains long labels and loop routes inside the workflow body", () => {
    const value = system();
    value.workflows[0].internalEdges.push({
      id: "self",
      source: "goal",
      target: "goal",
      condition: "condition ".repeat(40),
    });
    const { nodes, edges } = graph(value);
    for (const edge of edges.filter((edge) => edge.type === "internal")) {
      const child = nodes.find((node) => node.id === edge.source);
      const parent = nodes.find((node) => node.id === child?.parentId);
      expect(parent).toBeDefined();
      if (!parent) continue;
      for (const point of edge.data?.routePoints as Point[]) {
        expect(point.x).toBeGreaterThanOrEqual(parent.position.x);
        expect(point.y).toBeGreaterThanOrEqual(parent.position.y + 48);
        expect(point.x).toBeLessThanOrEqual(
          parent.position.x + Number(parent.style?.width),
        );
        expect(point.y).toBeLessThanOrEqual(
          parent.position.y + Number(parent.style?.height) - 40,
        );
      }
    }
  });

  it("gives empty workflows finite dimensions", () => {
    const value = system();
    value.workflows = [{ ...workflow("empty"), nodes: [], internalEdges: [] }];
    value.transitions = [];
    for (const node of graph(value).nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(Number(node.style?.height))).toBe(true);
    }
  });
});
