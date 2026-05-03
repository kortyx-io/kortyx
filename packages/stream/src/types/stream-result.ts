import { z } from "zod";
import { StreamChunkSchema } from "./stream-chunk";

export const StreamResultSchema = z.object({
  chunks: z.array(StreamChunkSchema),
  transitionTo: z.string().optional(),
  payload: z.record(z.string(), z.any()).optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
      cause: z.unknown().optional(),
    })
    .nullable()
    .optional(),
});

export type StreamResult = z.infer<typeof StreamResultSchema>;
