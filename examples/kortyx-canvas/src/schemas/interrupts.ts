import { z } from "zod";

/**
 * Shape the LLM must produce when emitting a picker (brief / agent)
 * interrupt. Uses `kind: "choice"` (not `text`) so kortyx's client-side
 * `chat.send` does NOT auto-route plain chat-input submissions into
 * `respondToHumanInput` — only an explicit pick from the picker UI
 * (which calls `chat.respondToInterrupt`) resolves the interrupt; any
 * other typing falls through as a fresh chat turn that re-classifies.
 *
 * `options` is required by kortyx's `InterruptChoiceInput` type but the
 * picker UI doesn't render it (it dispatches on `schemaId` and uses an
 * AsyncSearchSelect against `meta.candidates`), so we default it to an
 * empty array. The system prompt instructs the LLM not to generate any
 * options.
 */
export const pickerRequestSchema = z.object({
  kind: z.literal("choice"),
  question: z.string().min(1),
  options: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
});

/** The picker resolves with the selected entity id as a plain string. */
export const pickerResponseSchema = z.string().min(1);

/**
 * Shape used by the yes/no removal-confirmation interrupt. Reuses the
 * kortyx `choice` interrupt machinery; the response shape is just the
 * option id the user clicked.
 */
export const confirmRemovalRequestSchema = z.object({
  kind: z.literal("choice"),
  question: z.string().min(1),
  options: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
    }),
  ),
});

/** Bulk removal — user picks which proposed deletes to apply. */
export const confirmBulkRemovalRequestSchema = z.object({
  kind: z.literal("multi-choice"),
  question: z.string().min(1),
  multiple: z.literal(true),
  options: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
    }),
  ),
});

export const confirmBulkRemovalResponseSchema = z.array(z.string().min(1));

/**
 * Shape used by the prompt-initiated save confirmation interrupt. Same
 * underlying kortyx `choice` machinery as `confirmRemovalRequestSchema`,
 * but kept separate so the client renderer can style the primary action
 * as a positive ("Save canvas") instead of destructive button.
 *
 * `question` is intentionally allowed to be empty: `confirmSaveNode`
 * streams a per-locale confirmation sentence via `useReason` BEFORE the
 * interrupt fires, so the chips render as a bare choice right under that
 * message. Forcing a non-empty item here would either duplicate that
 * text or require a second LLM call.
 */
export const confirmSaveRequestSchema = z.object({
  kind: z.literal("choice"),
  question: z.string(),
  options: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
    }),
  ),
});

export type PickerRequest = z.infer<typeof pickerRequestSchema>;
export type PickerResponse = z.infer<typeof pickerResponseSchema>;
export type ConfirmRemovalRequest = z.infer<typeof confirmRemovalRequestSchema>;
export type ConfirmBulkRemovalRequest = z.infer<
  typeof confirmBulkRemovalRequestSchema
>;
export type ConfirmBulkRemovalResponse = z.infer<
  typeof confirmBulkRemovalResponseSchema
>;
export type ConfirmSaveRequest = z.infer<typeof confirmSaveRequestSchema>;
