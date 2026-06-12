import { z } from "zod";
import { itemSchema, sectionSchema } from "./discovery-canvas";

/**
 * Discriminated-union of all canvas mutations the update-canvas workflow can
 * produce. The client routes each variant to a matching store mutator;
 * `summarizeUpdatesNode` and the thinking-pill collapsible read the shared
 * `label`/`reason` fields and ignore the rest.
 *
 * `op:"set"` is the legacy patch shape (string rewrite of one field) — it
 * still streams progressively via `useReason({ structured.fields })`. All
 * other ops are atomic: the producing node emits one final `canvas.patches`
 * chunk with the completed op.
 */

const sharedFields = {
  /** User-friendly target name, e.g. `Item 1 of "Core Assumption"`. */
  label: z.string().min(1),
  /** Short reason (one sentence) the model gives for this op. */
  reason: z.string().min(1),
};

export const setOpSchema = z.object({
  op: z.literal("set"),
  /** Dot path into `DiscoveryCanvasResponse`. */
  path: z.string().min(1),
  /** New string value to write at `path`. */
  value: z.string(),
  ...sharedFields,
});

export const addSectionOpSchema = z.object({
  op: z.literal("addSection"),
  /** New section key (snake_case, unique within the current canvas). */
  sectionKey: z.string().min(1),
  /** Full section payload — drafted by the LLM, validated here. */
  section: sectionSchema,
  ...sharedFields,
});

export const removeSectionOpSchema = z.object({
  op: z.literal("removeSection"),
  sectionKey: z.string().min(1),
  ...sharedFields,
});

export const addItemOpSchema = z.object({
  op: z.literal("addItem"),
  /** Internal section key the new item belongs under. */
  sectionKey: z.string().min(1),
  /** New item key (snake_case, unique within the section). */
  itemKey: z.string().min(1),
  /** Full item payload. */
  item: itemSchema,
  ...sharedFields,
});

export const removeItemOpSchema = z.object({
  op: z.literal("removeItem"),
  sectionKey: z.string().min(1),
  itemKey: z.string().min(1),
  ...sharedFields,
});

export const canvasOpSchema = z.discriminatedUnion("op", [
  setOpSchema,
  addSectionOpSchema,
  removeSectionOpSchema,
  addItemOpSchema,
  removeItemOpSchema,
]);

export type SetOp = z.infer<typeof setOpSchema>;
export type AddSectionOp = z.infer<typeof addSectionOpSchema>;
export type RemoveSectionOp = z.infer<typeof removeSectionOpSchema>;
export type AddItemOp = z.infer<typeof addItemOpSchema>;
export type RemoveItemOp = z.infer<typeof removeItemOpSchema>;
export type DiscoveryCanvasOp = z.infer<typeof canvasOpSchema>;

/**
 * Set of op kinds the classifier can resolve to. Mirrors `condition` values
 * on the update-canvas workflow's forking edges.
 */
export const UPDATE_OP_KINDS = [
  "update_field",
  "add_section",
  "remove_section",
  "add_item",
  "remove_item",
] as const;

export type UpdateOpKind = (typeof UPDATE_OP_KINDS)[number];

/* ---------- LLM-facing draft schemas (per branch) ---------- */

/**
 * `add_section` branch: shape we ask the LLM to produce. The full
 * section payload is validated against the canonical
 * `sectionSchema`; we strip the `op` discriminator off the model output
 * to save tokens and stamp it server-side.
 */
export const addSectionDraftSchema = z.object({
  sectionKey: z.string().min(1),
  section: sectionSchema,
  label: z.string().min(1),
  reason: z.string().min(1),
});

/** `add_item` branch draft shape. */
export const addItemDraftSchema = z.object({
  sectionKey: z.string().min(1),
  itemKey: z.string().min(1),
  item: itemSchema,
  label: z.string().min(1),
  reason: z.string().min(1),
});

export const removeSectionTargetSchema = z.object({
  sectionKey: z.string().min(1),
  label: z.string().min(1),
  reason: z.string().min(1),
});

/** `remove_section` branch resolver shape — one or more section targets. */
export const removeSectionsResolveSchema = z.object({
  sections: z.array(removeSectionTargetSchema),
});

export const removeItemTargetSchema = z.object({
  sectionKey: z.string().min(1),
  itemKey: z.string().min(1),
  label: z.string().min(1),
  reason: z.string().min(1),
});

/** `remove_item` branch resolver shape — one or more item targets. */
export const removeItemsResolveSchema = z.object({
  items: z.array(removeItemTargetSchema),
});

/** @deprecated use {@link removeSectionTargetSchema} */
export const removeSectionResolveSchema = removeSectionTargetSchema;

/** @deprecated use {@link removeItemTargetSchema} */
export const removeItemResolveSchema = removeItemTargetSchema;

/** Classifier output for the update-canvas workflow's branch fork. */
export const classifyUpdateOpSchema = z.object({
  op: z.enum(UPDATE_OP_KINDS),
});

/* ---------- update_field branch ---------- */

/**
 * One concrete edit target produced by `findUpdatePathsNode`. Each is a
 * pointer to one editable string field + a paraphrased instruction the
 * downstream `apply-updates` LLM call rewrites against.
 */
export const updateTargetSchema = z.object({
  /**
   * Dot path into the DiscoveryCanvasResponse. Examples:
   * - `intro.label`
   * - `intro.summary`
   * - `intro.item_text`
   * - `sections.<section_key>.section_label`
   * - `sections.<section_key>.section_summary`
   * - `sections.<section_key>.section_rationale`
   * - `sections.<section_key>.items.<item_key>.item_text`
   * - `sections.<section_key>.items.<item_key>.item_rationale`
   */
  path: z.string().min(1),
  /** What the user wants done, paraphrased from their message. */
  instruction: z.string().min(1),
  /**
   * Short human-readable description of the target, e.g.
   * `Item 1 of "Core Assumption"`. Used by the summarizer node so
   * it never has to expose raw paths to the user.
   */
  label: z.string().min(1),
});

export const updateTargetsSchema = z.object({
  updates: z.array(updateTargetSchema),
});

export type UpdateTarget = z.infer<typeof updateTargetSchema>;

/** LLM-facing patch shape produced by `applyUpdatesNode`. */
export const llmPatchSchema = z.object({
  path: z.string().min(1),
  value: z.string(),
  label: z.string().min(1),
  reason: z.string().min(1),
});

/** LLM output for `applyUpdatesNode` — keyed by path-derived record keys. */
export const llmPatchesSchema = z.object({
  patches: z.record(z.string(), llmPatchSchema),
});

export type LlmPatch = z.infer<typeof llmPatchSchema>;
