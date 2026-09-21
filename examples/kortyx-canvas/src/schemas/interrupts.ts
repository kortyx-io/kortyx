import { z } from "zod";

/**
 * Shape the model must send through a brief / agent interrupt contract.
 * Kortyx transports it as an opaque `custom` request, so only the picker UI's
 * explicit `respondToInterrupt(..., { value })` call resolves the operation;
 * typing in the normal composer remains a fresh chat turn.
 *
 * The UI dispatches on the contract's `schemaId`, renders `candidates` as a
 * shortlist, and keeps an AsyncSearchSelect as the fallback. `options` stays
 * empty because this custom picker does not use Kortyx's generic choice UI.
 */
export const pickerRequestSchema = z.object({
  kind: z.literal("choice"),
  question: z.string().min(1),
  options: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
  candidates: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
      }),
    )
    .default([]),
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
