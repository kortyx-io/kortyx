// Workflow identifier type for Kortyx.
// Lifted from apps/chat-api/src/types/workflow-id.ts.

import { z } from "zod";

export const WorkflowIdSchema = z
  .string()
  .min(1)
  .describe("Workflow identifier");

export type WorkflowId = z.infer<typeof WorkflowIdSchema>;
