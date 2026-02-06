// Core graph state types for Kortyx
// Based on apps/chat-api/src/types/graph-state.ts, but with generic config/message.

import { z } from "zod";
import type { WorkflowId } from "./workflow/id";
// Keep WorkflowId schema simple; concrete apps can extend via their own types.
import { WorkflowIdSchema } from "./workflow/id";

export type GraphCheckpoint = {
  id: string;
  nodeId: string;
  timestamp: number;
  snapshot: Record<string, unknown>;
  note?: string;
};

export type TokenUsage = {
  input: number;
  output: number;
  total: number;
};

export type MemoryEnvelope = {
  currentWorkflow?: WorkflowId;
  checkpoints?: Record<string, GraphCheckpoint>;
  toolResults?: unknown;
  flags?: Record<string, any>;
  tokenUsage?: TokenUsage;
  lastSearch?: unknown;
  lastRank?: unknown;
  conversationMessages?: any[];
};

export type ConversationHistoryEntry = {
  node: string;
  message: string;
  timestamp: string;
};

export type GraphState = {
  input: unknown;
  lastNode: string;
  currentWorkflow: WorkflowId;
  // Config is intentionally loose in core; apps can refine it.
  // Use `any` here so downstream apps can access fields without extra casting.
  config: any;
  startedAt?: number;
  updatedAt?: number;
  memory: MemoryEnvelope;
  transitionTo?: WorkflowId;
  retryCount?: number;
  awaitingHumanInput: boolean;
  humanInputPayload?: Record<string, unknown>;
  data?: Record<string, unknown>;
  ui?: {
    message?: string;
    structured?: Record<string, unknown>;
  };
  conversationHistory: ConversationHistoryEntry[];
  lastCondition?: string;
  lastIntent?: string;
  reasoning?: string;
  lastError?: {
    message: string;
    stack?: string;
    name?: string;
  };
};

export type GraphStateInput = Omit<
  GraphState,
  "lastNode" | "memory" | "awaitingHumanInput" | "conversationHistory"
> & {
  lastNode?: string;
  memory?: MemoryEnvelope;
  awaitingHumanInput?: boolean;
  conversationHistory?: ConversationHistoryEntry[];
};

export const GraphCheckpointSchema = z
  .object({
    id: z.string(),
    nodeId: z.string(),
    timestamp: z.number().int(),
    snapshot: z.record(z.unknown()),
    note: z.string().optional(),
  })
  .strict() as z.ZodType<GraphCheckpoint>;

export const TokenUsageSchema = z
  .object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    total: z.number().nonnegative(),
  })
  .strict() as z.ZodType<TokenUsage>;

// Generic envelope; concrete apps can refine via intersection or extension.
export const MemoryEnvelopeSchema = z
  .object({
    currentWorkflow: WorkflowIdSchema.optional(),
    checkpoints: z.record(GraphCheckpointSchema).optional(),
    toolResults: z.unknown().optional(),
    flags: z.record(z.any()).optional(),
    tokenUsage: TokenUsageSchema.optional(),
    lastSearch: z.unknown().optional(),
    lastRank: z.unknown().optional(),
    conversationMessages: z.array(z.any()).optional(),
  })
  .strict() as z.ZodType<MemoryEnvelope>;

export const GraphStateSchema = z
  .object({
    input: z.unknown(),
    lastNode: z.string().optional().default("__start__"),
    currentWorkflow: WorkflowIdSchema,
    // Config is intentionally loose in core; apps can refine it.
    // Use `any` here so downstream apps can access fields without extra casting.
    config: z.any(),
    startedAt: z.number().optional(),
    updatedAt: z.number().optional(),
    memory: MemoryEnvelopeSchema.optional().default({}),
    transitionTo: WorkflowIdSchema.optional(),
    retryCount: z.number().int().optional(),
    awaitingHumanInput: z.boolean().optional().default(false),
    humanInputPayload: z.record(z.unknown()).optional(),
    data: z.record(z.unknown()).optional(),
    ui: z
      .object({
        message: z.string().optional(),
        structured: z.record(z.unknown()).optional(),
      })
      .optional(),
    conversationHistory: z
      .array(
        z.object({
          node: z.string(),
          message: z.string(),
          timestamp: z.string(),
        }),
      )
      .default([]),
    lastCondition: z.string().optional(),
    lastIntent: z.string().optional(),
    reasoning: z.string().optional(),
    lastError: z
      .object({
        message: z.string(),
        stack: z.string().optional(),
        name: z.string().optional(),
      })
      .optional(),
  })
  .strict() as z.ZodType<GraphState, z.ZodTypeDef, GraphStateInput>;

export const parseGraphState = (data: unknown): GraphState =>
  GraphStateSchema.parse(data);
