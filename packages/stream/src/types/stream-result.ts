import {
  type FailureDescriptor,
  isFailureDescriptor,
  serializeFailure,
} from "@kortyx/core/errors";
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
      failure: z
        .custom<FailureDescriptor>(isFailureDescriptor)
        .transform(serializeFailure)
        .optional(),
      cause: z.unknown().optional(),
    })
    .nullable()
    .optional(),
});

export type StreamResult = z.infer<typeof StreamResultSchema>;
