import "server-only";

import { google } from "@kortyx/google";
import { useReason } from "kortyx";
import { describeOpForSummary } from "../../lib/describe-op-for-summary";
import { loadPrompt } from "../../prompts/_registry";
import type { DiscoveryCanvasOp } from "../../schemas/canvas-ops";

type SummarizeUpdatesInput = {
  /**
   * Canonical op array merged from whichever branch ran (update_field /
   * add_* / remove_*). Each op carries its own user-friendly `label` and
   * `reason`, so this node is agnostic to which structural variant fired.
   */
  patches?: DiscoveryCanvasOp[];
  /**
   * Set by remove-* branches when the user denied the confirm
   * interrupt. Distinguishes "user cancelled" from "we couldn't figure
   * out what they meant" so the summary message can be soft + reassuring
   * instead of asking them to rephrase.
   */
  cancelled?: boolean;
  cancelledLabel?: string;
};

type SummarizeUpdatesParams = {
  temperature?: number;
};

/**
 * Final step of the update-canvas workflow. Streams a short, friendly
 * chat message confirming what changed. References targets by user-
 * friendly `label` only — never by path, key, or any technical
 * identifier — because those are meaningless to the user.
 *
 * When no patches were produced (ambiguous request, nothing matched), it
 * streams a single sentence asking the user to clarify instead.
 */
export const summarizeUpdatesNode = async ({
  input,
  params,
}: {
  input: SummarizeUpdatesInput;
  params: SummarizeUpdatesParams;
}) => {
  const patches = input?.patches ?? [];

  if (input?.cancelled) {
    const { system, user } = loadPrompt("summarize-updates.cancelled", {
      cancelledLabel: input.cancelledLabel ?? "that item",
    });
    await useReason({
      id: "summarize-updates-cancelled",
      model: google("gemini-2.5-flash"),
      system,
      input: user,
      temperature: params.temperature ?? 0.4,
      stream: true,
      emit: true,
    });
    return { data: { summary: "" } };
  }

  if (patches.length === 0) {
    const { system, user } = loadPrompt("summarize-updates.empty", {});
    await useReason({
      id: "summarize-updates-empty",
      model: google("gemini-2.5-flash"),
      system,
      input: user,
      temperature: params.temperature ?? 0.5,
      stream: true,
      emit: true,
    });
    return { data: { summary: "" } };
  }

  const opsBlock = patches
    .map((p) => `- ${describeOpForSummary(p)}`)
    .join("\n");
  const { system, user } = loadPrompt("summarize-updates.applied", {
    opsBlock,
  });

  const result = await useReason({
    id: "summarize-updates",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    temperature: params.temperature ?? 0.5,
    stream: true,
    emit: true,
  });

  console.log("[summarize-updates] done", {
    patchCount: patches.length,
    chars: result.text.length,
  });

  return { data: { summary: result.text } };
};
