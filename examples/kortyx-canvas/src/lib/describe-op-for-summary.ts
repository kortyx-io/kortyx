import type { DiscoveryCanvasOp } from "@/schemas/canvas-ops";

/**
 * Op → one-line prose hint for the summarize-updates user payload.
 * Surfaces the action verb (updated/added/removed) so the LLM can
 * phrase the chat confirmation naturally without us spelling it out in
 * the system prompt.
 *
 * Previously lived in `prompts/summarize-updates.ts`; moved into `lib/`
 * during the Phase 2 prompt refactor so the prompt files only contain
 * static templates, no helpers.
 */
export function describeOpForSummary(op: DiscoveryCanvasOp): string {
  switch (op.op) {
    case "set":
      return `Updated ${op.label}`;
    case "addSection":
      return `Added new section ${op.label}`;
    case "removeSection":
      return `Removed section ${op.label}`;
    case "addItem":
      return `Added new item — ${op.label}`;
    case "removeItem":
      return `Removed ${op.label}`;
  }
}
