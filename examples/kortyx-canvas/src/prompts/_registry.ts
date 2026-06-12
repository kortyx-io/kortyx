/**
 * Central registry of static prompt templates plus the `loadPrompt`
 * entry point everyone else in the agent uses. Adding a new prompt is
 * a two-step process:
 *
 *   1. Create the template file (e.g. `confirm-save.prompt-driven.ts`)
 *      and export a single `PromptTemplate` constant.
 *   2. Register it here under its canonical name.
 *
 * The `PromptName` union is derived from the registry so callers get
 * autocomplete + compile-time errors when referencing a non-existent
 * prompt. If the example ever swaps local templates for a remote prompt
 * provider, this is the file that gets the fetch behind the same
 * `loadPrompt` API — everything else keeps working unchanged.
 */

import type { CompiledPrompt, PromptTemplate } from "./_loader";
import { compilePrompt } from "./_loader";

import { ACKNOWLEDGE_UPDATE_INTENT_PROMPT } from "./acknowledge-update-intent";
import { ADD_ITEM_PROMPT } from "./add-item";
import { ADD_SECTION_PROMPT } from "./add-section";
import { ANNOUNCE_CANVAS_CREATION_PROMPT } from "./announce-canvas-creation";
import { APPLY_UPDATES_PROMPT } from "./apply-updates";
import { CHAT_RESPONSE_PROMPT } from "./chat-response";
import { CLASSIFY_CHAT_INTENT_NO_CANVAS_PROMPT } from "./classify-chat-intent.no-canvas";
import { CLASSIFY_CHAT_INTENT_WITH_CANVAS_PROMPT } from "./classify-chat-intent.with-canvas";
import { CLASSIFY_UPDATE_OP_PROMPT } from "./classify-update-op";
import { CONFIRM_SAVE_PROMPT_DRIVEN_PROMPT } from "./confirm-save.prompt-driven";
import { CONFIRM_SAVE_UPDATE_FALLBACK_PROMPT } from "./confirm-save.update-fallback";
import { CREATE_DISCOVERY_CANVAS_PROMPT } from "./create-canvas";
import { DESCRIBE_BRIEF_FALLBACK_PROMPT } from "./describe-brief.fallback";
import { DESCRIBE_BRIEF_STANDARD_PROMPT } from "./describe-brief.standard";
import { FIND_UPDATE_PATHS_PROMPT } from "./find-update-paths";
import { REMOVE_ITEM_PROMPT } from "./remove-item";
import { REMOVE_SECTION_PROMPT } from "./remove-section";
import { RESOLVE_BRIEF_AGENT_PROMPT } from "./resolve-brief-agent";
import { RESOLVE_BRIEF_QUERY_PROMPT } from "./resolve-brief-query";
import { RESPOND_TO_POLICY_REFUSAL_PROMPT } from "./respond-to-policy-refusal";
import { RESPOND_TO_SAVE_CANCELLED_EMPTY_CANVAS_PROMPT } from "./respond-to-save.cancelled-empty-canvas";
import { RESPOND_TO_SAVE_CANCELLED_OTHER_PROMPT } from "./respond-to-save.cancelled-other";
import { RESPOND_TO_SAVE_CANCELLED_UPDATE_FALLBACK_PROMPT } from "./respond-to-save.cancelled-update-fallback";
import { RESPOND_TO_SAVE_NO_OUTCOME_PROMPT } from "./respond-to-save.no-outcome";
import { RESPOND_TO_SAVE_SAVE_ERRORED_PROMPT } from "./respond-to-save.save-errored";
import { RESPOND_TO_SAVE_SAVE_SUCCEEDED_PROMPT } from "./respond-to-save.save-succeeded";
import { RESPOND_TO_SAVE_VALIDATION_FAILED_PROMPT } from "./respond-to-save.validation-failed";
import { SCREEN_UPDATE_INTENT_PROMPT } from "./screen-update-intent";
import { SUMMARIZE_CANVAS_CLEAN_PROMPT } from "./summarize-canvas.clean";
import { SUMMARIZE_CANVAS_VIOLATIONS_PROMPT } from "./summarize-canvas.violations";
import { SUMMARIZE_UPDATES_APPLIED_PROMPT } from "./summarize-updates.applied";
import { SUMMARIZE_UPDATES_CANCELLED_PROMPT } from "./summarize-updates.cancelled";
import { SUMMARIZE_UPDATES_EMPTY_PROMPT } from "./summarize-updates.empty";
import { VALIDATE_CANVAS_CONTENT_PROMPT } from "./validate-canvas-content";

export const PROMPT_REGISTRY = {
  "acknowledge-update-intent": ACKNOWLEDGE_UPDATE_INTENT_PROMPT,
  "add-section": ADD_SECTION_PROMPT,
  "add-item": ADD_ITEM_PROMPT,
  "announce-canvas-creation": ANNOUNCE_CANVAS_CREATION_PROMPT,
  "apply-updates": APPLY_UPDATES_PROMPT,
  "chat-response": CHAT_RESPONSE_PROMPT,
  "classify-chat-intent.no-canvas": CLASSIFY_CHAT_INTENT_NO_CANVAS_PROMPT,
  "classify-chat-intent.with-canvas": CLASSIFY_CHAT_INTENT_WITH_CANVAS_PROMPT,
  "classify-update-op": CLASSIFY_UPDATE_OP_PROMPT,
  "confirm-save.prompt-driven": CONFIRM_SAVE_PROMPT_DRIVEN_PROMPT,
  "confirm-save.update-fallback": CONFIRM_SAVE_UPDATE_FALLBACK_PROMPT,
  "create-canvas": CREATE_DISCOVERY_CANVAS_PROMPT,
  "describe-brief.fallback": DESCRIBE_BRIEF_FALLBACK_PROMPT,
  "describe-brief.standard": DESCRIBE_BRIEF_STANDARD_PROMPT,
  "find-update-paths": FIND_UPDATE_PATHS_PROMPT,
  "remove-section": REMOVE_SECTION_PROMPT,
  "remove-item": REMOVE_ITEM_PROMPT,
  "resolve-brief-agent": RESOLVE_BRIEF_AGENT_PROMPT,
  "resolve-brief-query": RESOLVE_BRIEF_QUERY_PROMPT,
  "respond-to-policy-refusal": RESPOND_TO_POLICY_REFUSAL_PROMPT,
  "respond-to-save.cancelled-empty-canvas":
    RESPOND_TO_SAVE_CANCELLED_EMPTY_CANVAS_PROMPT,
  "respond-to-save.cancelled-other": RESPOND_TO_SAVE_CANCELLED_OTHER_PROMPT,
  "respond-to-save.cancelled-update-fallback":
    RESPOND_TO_SAVE_CANCELLED_UPDATE_FALLBACK_PROMPT,
  "respond-to-save.no-outcome": RESPOND_TO_SAVE_NO_OUTCOME_PROMPT,
  "respond-to-save.save-errored": RESPOND_TO_SAVE_SAVE_ERRORED_PROMPT,
  "respond-to-save.save-succeeded": RESPOND_TO_SAVE_SAVE_SUCCEEDED_PROMPT,
  "respond-to-save.validation-failed": RESPOND_TO_SAVE_VALIDATION_FAILED_PROMPT,
  "screen-update-intent": SCREEN_UPDATE_INTENT_PROMPT,
  "summarize-canvas.clean": SUMMARIZE_CANVAS_CLEAN_PROMPT,
  "summarize-canvas.violations": SUMMARIZE_CANVAS_VIOLATIONS_PROMPT,
  "summarize-updates.applied": SUMMARIZE_UPDATES_APPLIED_PROMPT,
  "summarize-updates.cancelled": SUMMARIZE_UPDATES_CANCELLED_PROMPT,
  "summarize-updates.empty": SUMMARIZE_UPDATES_EMPTY_PROMPT,
  "validate-canvas-content": VALIDATE_CANVAS_CONTENT_PROMPT,
} as const satisfies Record<string, PromptTemplate>;

export type PromptName = keyof typeof PROMPT_REGISTRY;

/**
 * Look up a prompt by canonical name and compile it with the given
 * variables. Throws if the name is unknown or if any declared variable
 * is missing — both indicate a developer bug, not a runtime input
 * problem.
 */
export function loadPrompt(
  name: PromptName,
  vars: Record<string, string | undefined>,
): CompiledPrompt {
  const template = PROMPT_REGISTRY[name];
  return compilePrompt(template, vars);
}
