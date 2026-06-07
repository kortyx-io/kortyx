import type { FacilitatorStyleOption } from "@/services/demo-data";

/**
 * Renders a list of facilitatorStyles as an LLM-readable block: one line per
 * facilitatorStyle (`- <id>: <companyName>[ (default)]`). Empty lists collapse to
 * `(none)` so prompt branches that key on "no facilitatorStyles available" fire
 * deterministically.
 *
 * Shared by `create-canvas` and `apply-updates` so the agent sees the exact
 * same facilitatorStyle listing whether it's generating a canvas from scratch or
 * rewriting `facilitator_style_id` after the user asked for a switch.
 */
export function formatFacilitatorStylesForPrompt(
  facilitatorStyles: FacilitatorStyleOption[],
): string {
  if (facilitatorStyles.length === 0) return "(none)";
  return facilitatorStyles
    .map(
      (b) =>
        `- ${b.id}: ${b.name}${b.description ? ` (${b.description})` : ""}`,
    )
    .join("\n");
}
