import "server-only";

import { google } from "@kortyx/google";
import { useReason } from "kortyx";
import { loadPrompt } from "../../prompts/_registry";
import type { CreateDiscoveryCanvasPromptVariables } from "../../prompts/create-canvas";
import type { DiscoveryCanvasResponse } from "../../schemas/discovery-canvas";

type SummarizeDiscoveryCanvasNodeParams = {
  temperature?: number;
};

type SummarizeDiscoveryCanvasNodeInput = {
  canvas?: DiscoveryCanvasResponse;
  promptVars?: CreateDiscoveryCanvasPromptVariables;
};

/**
 * Streams a short, human-readable summary of the just-generated canvas
 * into the chat. Runs after `createDiscoveryCanvas` so the user sees something
 * conversational in the chat panel alongside the populated canvas.
 *
 * Uses `emit: true` + `stream: true` so the sentences land as a normal
 * streaming text message in the chat (not as structured data).
 */
export const summarizeDiscoveryCanvasNode = async ({
  input,
  params,
}: {
  input: SummarizeDiscoveryCanvasNodeInput;
  params: SummarizeDiscoveryCanvasNodeParams;
}) => {
  if (!input?.canvas) {
    throw new Error(
      "summarizeDiscoveryCanvasNode: missing canvas on workflow state — run createDiscoveryCanvasNode first",
    );
  }

  const userPayload = renderSummarizeDiscoveryCanvasUserPayload(
    input.canvas,
    input.promptVars,
  );
  const { system, user } = loadPrompt("summarize-canvas.clean", {
    userPayload,
  });

  console.log("[summarize-canvas] start", {
    sectionsCount: Object.keys(input.canvas.sections).length,
    briefTitle: input.promptVars?.briefTitle,
  });

  const result = await useReason({
    id: "summarize-canvas",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    temperature: params.temperature ?? 0.6,
    stream: true,
    emit: true,
  });

  console.log("[summarize-canvas] done", { chars: result.text.length });

  return {
    data: { summary: result.text },
  };
};

/**
 * Pre-renders the user payload for the summarize-canvas.clean prompt.
 * Lives here (not in `lib/`) because the format is tightly coupled to
 * that template and isn't reused elsewhere.
 *
 * Returns the empty string when no content is available — the template
 * adds the leading `\n` itself so the LLM still sees the standard
 * footer.
 */
function renderSummarizeDiscoveryCanvasUserPayload(
  canvas: DiscoveryCanvasResponse,
  promptVars: CreateDiscoveryCanvasPromptVariables | undefined,
): string {
  const lines: string[] = [];
  if (promptVars?.briefTitle) lines.push(`Brief: ${promptVars.briefTitle}`);
  if (canvas.intro?.label) {
    lines.push(`Product brief title: ${canvas.intro.label}`);
  }
  if (canvas.intro?.summary) {
    lines.push(`Product brief description: ${canvas.intro.summary}`);
  }
  if (canvas.intro?.item_text) {
    lines.push(`Intro item: ${canvas.intro.item_text}`);
  }
  const entries = Object.entries(canvas.sections);
  if (entries.length > 0) {
    lines.push(`Sections (${entries.length}):`);
    for (const [, c] of entries) {
      lines.push(`  - ${c.section_label}: ${c.section_summary}`);
    }
  }
  if (lines.length === 0) return "";
  return `${lines.join("\n")}\n`;
}
