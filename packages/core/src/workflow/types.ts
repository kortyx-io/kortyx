import type { NodeResult } from "../node";
import type { WorkflowEdge, WorkflowNodeBehavior } from "./schema";

export type NodeFn = (args: {
  input: unknown;
  params?: Record<string, unknown> | undefined;
}) => Promise<NodeResult> | NodeResult;

export type NodeRunRef = string | NodeFn;

export type WorkflowNodeDef = {
  run: NodeRunRef;
  params?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
  behavior?: WorkflowNodeBehavior | undefined;
};

export type WorkflowNodes = Record<string, WorkflowNodeDef>;

export type WorkflowDefinition = {
  id: string;
  version: string;
  description?: string | undefined;
  nodes: WorkflowNodes;
  edges: WorkflowEdge[];
  metadata?: Record<string, unknown> | undefined;
};
