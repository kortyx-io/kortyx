// NOTE:
// Current API returns a simple { ok, value | errors } result.
// In the future we may add:
// - A formatted, human-friendly error message (e.g. single string)
// - A dedicated ValidationError class for throwing-style APIs
// - Error codes / categories for Studio & CLI integrations
// Keep this file as the central place for workflow validation and error shaping.

import type { ZodIssue } from "zod";
import { type WorkflowConfig, WorkflowDefinitionSchema } from "./schema";

export interface WorkflowValidationError {
  path: (string | number)[];
  message: string;
  code: string;
}

export function validateWorkflow(
  workflow: unknown,
):
  | { ok: true; value: WorkflowConfig }
  | { ok: false; errors: WorkflowValidationError[] } {
  const result = WorkflowDefinitionSchema.safeParse(workflow);

  if (result.success) {
    return { ok: true, value: result.data };
  }

  const errors: WorkflowValidationError[] = result.error.issues.map(
    (issue: ZodIssue) => ({
      path: issue.path.filter(
        (p): p is string | number => typeof p !== "symbol",
      ),
      message: issue.message,
      code: issue.code,
    }),
  );

  return { ok: false, errors };
}
