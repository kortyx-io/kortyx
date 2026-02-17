import { z } from "zod";
import { StructuredDataChunkSchema } from "./structured-data";

export const StreamChunkSchema = z.union([
  z.object({
    type: z.literal("session"),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal("status"),
    message: z.string(),
    node: z.string().optional(),
  }),
  z.object({
    type: z.literal("message"),
    content: z.string(),
    node: z.string().optional(),
  }),
  z.object({
    type: z.literal("text-start"),
    node: z.string().optional(),
    id: z.string().optional(),
    opId: z.string().optional(),
    segmentId: z.string().optional(),
  }),
  z.object({
    type: z.literal("text-delta"),
    delta: z.string(),
    node: z.string().optional(),
    id: z.string().optional(),
    opId: z.string().optional(),
    segmentId: z.string().optional(),
  }),
  z.object({
    type: z.literal("text-end"),
    node: z.string().optional(),
    id: z.string().optional(),
    opId: z.string().optional(),
    segmentId: z.string().optional(),
  }),
  z.object({
    type: z.literal("tool-result"),
    tool: z.string().optional(),
    node: z.string().optional(),
    content: z.unknown(),
  }),
  // Interrupt request chunk (used to render interactive options in UI)
  z.object({
    type: z.literal("interrupt"),
    requestId: z.string(),
    resumeToken: z.string(),
    workflow: z.string().optional(),
    node: z.string().optional(),
    id: z.string().optional(),
    opId: z.string().optional(),
    schemaId: z.string().optional(),
    schemaVersion: z.string().optional(),
    input: z.discriminatedUnion("kind", [
      // Text input: question optional, no options
      z.object({
        kind: z.literal("text"),
        multiple: z.boolean(),
        question: z.string().optional(),
        id: z.string().optional(),
        schemaId: z.string().optional(),
        schemaVersion: z.string().optional(),
        meta: z.record(z.unknown()).optional(),
        options: z.array(z.never()).optional(),
      }),
      // Choice/multi-choice: question + options required
      z.object({
        kind: z.enum(["choice", "multi-choice"]),
        multiple: z.boolean(),
        question: z.string(),
        id: z.string().optional(),
        schemaId: z.string().optional(),
        schemaVersion: z.string().optional(),
        meta: z.record(z.unknown()).optional(),
        options: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            description: z.string().optional(),
          }),
        ),
      }),
    ]),
    meta: z.record(z.unknown()).optional(),
  }),
  StructuredDataChunkSchema,
  z.object({
    type: z.literal("transition"),
    transitionTo: z.string(),
    payload: z.any().optional(),
  }),
  z.object({ type: z.literal("done"), data: z.any().optional() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type StreamChunk = z.infer<typeof StreamChunkSchema>;
