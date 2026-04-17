import { z } from "zod";

const StructuredDataBase = z.object({
  type: z.literal("structured-data"),
  streamId: z.string(),
  dataType: z.string(),
  kind: z.enum(["set", "append", "text-delta", "final"]),
  schemaId: z.string().optional(),
  schemaVersion: z.string().optional(),
  id: z.string().optional(),
  node: z.string().optional(),
});

const StructuredSetChunkSchema = StructuredDataBase.extend({
  kind: z.literal("set"),
  path: z.string().min(1),
  value: z.unknown(),
});

const StructuredAppendChunkSchema = StructuredDataBase.extend({
  kind: z.literal("append"),
  path: z.string().min(1),
  items: z.array(z.unknown()),
});

const StructuredTextDeltaChunkSchema = StructuredDataBase.extend({
  kind: z.literal("text-delta"),
  path: z.string().min(1),
  delta: z.string(),
});

const StructuredFinalChunkSchema = StructuredDataBase.extend({
  kind: z.literal("final"),
  data: z.unknown(),
});

export const StructuredDataChunkSchema = z.union([
  StructuredSetChunkSchema,
  StructuredAppendChunkSchema,
  StructuredTextDeltaChunkSchema,
  StructuredFinalChunkSchema,
]);

export type StructuredDataChunk = z.infer<typeof StructuredDataChunkSchema>;
