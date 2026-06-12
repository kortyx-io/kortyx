import { z } from "zod";

/**
 * Intent classifier output for `chatNode`. Drives whether the general-chat
 * workflow answers in-place or hands off to a sibling workflow.
 *
 * - `general_chat`  — answer the message directly.
 * - `create_canvas`  — transition to canvas creation.
 * - `update_canvas`  — transition to canvas update (requires a canvas on the canvas).
 * - `find_brief`      — transition to brief lookup.
 * - `save_canvas`    — transition to canvas save (requires a canvas on the canvas).
 *                      Triggers the conversational save flow; the workflow then
 *                      asks the user to confirm via an interrupt before
 *                      persisting, since the user didn't click the canvas Save
 *                      button explicitly.
 */
export const CHAT_INTENTS = [
  "general_chat",
  "create_canvas",
  "update_canvas",
  "find_brief",
  "save_canvas",
] as const;

export const chatIntentSchema = z.object({
  intent: z.enum(CHAT_INTENTS),
});

export type ChatIntent = (typeof CHAT_INTENTS)[number];
