// Core node types and schemas for Kortyx
// Derived from apps/chat-api/src/types/node.ts with minimal changes.

import { z } from "zod";
import type { GraphState } from "./state";
import type { WorkflowId } from "./workflow/id";
import { WorkflowIdSchema } from "./workflow/id";

export type ModelConfig = {
  provider: string;
  name: string;
  temperature?: number;
};

export type ToolConfig = {
  name?: string;
  args?: Record<string, unknown>;
};

export type RetryConfig = {
  maxAttempts?: number;
  delayMs?: number;
};

export type NodeBehavior = {
  checkpoint?: boolean;
  retry?: RetryConfig;
  prompt?: string;
};

export type NodeConfig = {
  model?: ModelConfig;
  tool?: ToolConfig;
  behavior?: NodeBehavior;
  options?: Record<string, unknown>;
};

export type InterruptTextInput = {
  kind: "text";
  question?: string;
  id?: string;
  schemaId?: string;
  schemaVersion?: string;
  meta?: Record<string, unknown>;
};

export type InterruptChoiceInput = {
  kind: "choice" | "multi-choice";
  question: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
    value?: unknown;
  }>;
  multiple?: boolean;
  id?: string;
  schemaId?: string;
  schemaVersion?: string;
  meta?: Record<string, unknown>;
};

export type InterruptInput = InterruptTextInput | InterruptChoiceInput;

export type InterruptResult = string | string[];

export type NodeContext = {
  graph: {
    name: string;
    node: string;
  };
  config: NodeConfig;
  emit: (event: string, payload: unknown) => void;
  error: (message: string) => void;
  awaitInterrupt: (args: InterruptInput) => InterruptResult;
  speak: (args: {
    system?: string;
    user: string;
    model?: ModelConfig;
    stream?: {
      minChars?: number;
      flushMs?: number;
      segmentChars?: number;
    };
  }) => Promise<string>;
};

export type NodeResult = {
  infra?:
    | {
        runtime?: unknown;
        config?: unknown;
        checkpoint?: boolean;
        toolResults?: unknown;
        debug?: Record<string, unknown>;
      }
    | undefined;
  data?: Record<string, unknown> | undefined;
  ui?:
    | {
        message?: string;
        structured?: Record<string, unknown>;
      }
    | undefined;
  next?: string | undefined;
  condition?: string | undefined;
  intent?: string | undefined;
  transitionTo?: WorkflowId | undefined;
};

export const ModelConfigSchema = z
  .object({
    provider: z.string(),
    name: z.string(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict() as z.ZodType<ModelConfig>;

export const ToolConfigSchema = z
  .object({
    name: z.string().optional(),
    args: z.record(z.string(), z.unknown()).optional(),
  })
  .strict() as z.ZodType<ToolConfig>;

export const RetrySchema = z
  .object({
    maxAttempts: z.number().int().min(0).optional(),
    delayMs: z.number().int().min(0).optional(),
  })
  .strict() as z.ZodType<RetryConfig>;

export const NodeBehaviorSchema = z
  .object({
    checkpoint: z.boolean().optional(),
    retry: RetrySchema.optional(),
    prompt: z.string().optional(),
  })
  .strict() as z.ZodType<NodeBehavior>;

export const NodeConfigSchema = z
  .object({
    model: ModelConfigSchema.optional(),
    tool: ToolConfigSchema.optional(),
    behavior: NodeBehaviorSchema.optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict() as z.ZodType<NodeConfig>;

export const NodeContextSchema = z
  .object({
    graph: z
      .object({
        name: z.string(),
        node: z.string(),
      })
      .strict(),
    config: NodeConfigSchema,
    emit: z.custom<NodeContext["emit"]>((v) => typeof v === "function"),
    error: z.custom<NodeContext["error"]>((v) => typeof v === "function"),
    awaitInterrupt: z.custom<NodeContext["awaitInterrupt"]>(
      (v) => typeof v === "function",
    ),
    speak: z.custom<NodeContext["speak"]>((v) => typeof v === "function"),
  })
  .strict() as unknown as z.ZodType<NodeContext>;

export const NodeResultSchema = z
  .object({
    infra: z
      .object({
        runtime: z.unknown().optional(),
        config: z.unknown().optional(),
        checkpoint: z.boolean().optional(),
        toolResults: z.unknown().optional(),
        debug: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    ui: z
      .object({
        message: z.string().optional(),
        structured: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
    next: z.string().optional(),
    condition: z.string().optional(),
    intent: z.string().optional(),
    transitionTo: WorkflowIdSchema.optional(),
  })
  .strict() as z.ZodType<NodeResult>;

export type NodeHandler = (
  state: GraphState,
  ctx: NodeContext,
) => Promise<NodeResult>;

export const parseNodeConfig = (data: unknown): NodeConfig =>
  NodeConfigSchema.parse(data);

export const parseNodeContext = (data: unknown): NodeContext =>
  NodeContextSchema.parse(data);

export const parseNodeResult = (data: unknown): NodeResult =>
  NodeResultSchema.parse(data);
