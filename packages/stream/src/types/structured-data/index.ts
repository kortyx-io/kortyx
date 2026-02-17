import { z } from "zod";
import { JobsStructuredData } from "./jobs";

const StructuredDataBase = z.object({
  type: z.literal("structured-data"),
  dataType: z.string().optional(),
  mode: z.enum(["final", "patch", "snapshot"]).optional(),
  schemaId: z.string().optional(),
  schemaVersion: z.string().optional(),
  id: z.string().optional(),
  opId: z.string().optional(),
  node: z.string().optional(),
});

const JobsStructuredDataChunkSchema = StructuredDataBase.extend({
  dataType: z.literal("jobs"),
  data: JobsStructuredData,
});

const GenericStructuredDataChunkSchema = StructuredDataBase.extend({
  data: z.unknown(),
});

export const StructuredDataChunkSchema = z.union([
  JobsStructuredDataChunkSchema,
  GenericStructuredDataChunkSchema,
]);

export type StructuredDataChunk = z.infer<typeof StructuredDataChunkSchema>;
