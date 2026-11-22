import {
  type EvaluatorExecution,
  EvaluatorTargetSchema,
} from "@kortyx/telemetry-contracts";
import { z } from "zod";

export const EvaluatorRecordingsSchema = z.object({
  recordings: z.array(
    z.object({
      target: EvaluatorTargetSchema,
      label: z.string(),
      environment: z.string(),
    }),
  ),
});

export type EvaluatorRecording = z.infer<
  typeof EvaluatorRecordingsSchema
>["recordings"][number];

export type EvaluatorPreviewData = {
  recordings: z.infer<typeof EvaluatorRecordingsSchema>["recordings"];
  execution: EvaluatorExecution | null;
  error: string;
};
