import type { z } from "zod";
import type { NodeResult } from "../node";
import type { WorkflowEdge, WorkflowNodeBehavior } from "./schema";

export type NodeFn<Input = unknown, Params = any> = {
  // Bivariant callback so apps can narrow `input`/`params` per node while still
  // being assignable to the workflow `run` type (similar to React handler typing).
  bivarianceHack: (args: {
    input: Input;
    params: Params;
  }) => Promise<NodeResult> | NodeResult;
}["bivarianceHack"];

export type AnyNodeFn = (args: {
  input: any;
  params: any;
}) => NodeResult | Promise<NodeResult>;

export type NodeRunRef = string | AnyNodeFn;

export type WorkflowNodeDef = {
  run: NodeRunRef;
  params?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
  behavior?: WorkflowNodeBehavior | undefined;
};

export type WorkflowNodes = Record<string, WorkflowNodeDef>;

/** Pure, synchronous reducers for explicitly returned top-level output fields. */
export type WorkflowDataReducers<Output extends Record<string, unknown>> = {
  [K in keyof Output]?:
    | ((
        previous: Output[K] | undefined,
        next: Output[K],
      ) => Output[K] | undefined)
    | undefined;
};

export type WorkflowDefinition = {
  id: string;
  version: string;
  description?: string | undefined;
  inputSchema?: z.ZodType | undefined;
  outputSchema?: z.ZodType<Record<string, unknown>> | undefined;
  // Erased callback types at the registry boundary; defineWorkflow infers each field.
  reduce?: WorkflowDataReducers<Record<string, any>> | undefined;
  nodes: WorkflowNodes;
  edges: WorkflowEdge[];
  metadata?: Record<string, unknown> | undefined;
};
