import { z } from "zod";

/**
 * EU AI Act-aligned categories the content validator flags on canvas
 * canvass. Mirrors the high-level violation taxonomy in the existing
 * compliance-validation schema (`discovery-canvas-actions.ts`), so a future
 * refactor can collapse the two into a single shared enum.
 *
 * v1 surfaces NON_DISCRIMINATION as the worked example (religious items
 * being the canonical example). The other categories are listed so the validator
 * has the full taxonomy available — prompts can lean on whichever apply.
 */
export const violationCategorySchema = z.enum([
  "NON_DISCRIMINATION",
  "GENDER_NEUTRALITY",
  "SENSITIVE_DATA",
  "PROPORTIONALITY",
]);

export type ViolationCategory = z.infer<typeof violationCategorySchema>;

/**
 * One flagged field. `path` matches the dot-notation used by canvas-ops set
 * patches (e.g. `sections.<key>.items.<key>.item_text`) so
 * downstream renderers / agents can address the offending field directly.
 */
export const canvasViolationSchema = z.object({
  path: z.string().min(1),
  category: violationCategorySchema,
  excerpt: z.string(),
  explanation: z.string(),
  suggestion: z.string(),
});

export type DiscoveryCanvasViolation = z.infer<typeof canvasViolationSchema>;

export const canvasValidationResultSchema = z.object({
  pass: z.boolean(),
  violations: z.array(canvasViolationSchema),
});

export type DiscoveryCanvasValidationResult = z.infer<
  typeof canvasValidationResultSchema
>;

/**
 * Pre-flight refusal payload emitted by `screenUpdateIntentNode`. It mirrors
 * the legacy `custom-instructions-validator` output shape so the same
 * taxonomy is shared between the pre-flight screen and the post-hoc
 * validator. `result: "FAIL"` routes the update workflow to the policy-
 * refusal responder instead of generative branches.
 */
export const screenUpdateIntentResultSchema = z.object({
  result: z.enum(["PASS", "FAIL"]),
  category: violationCategorySchema.nullable(),
  excerpt: z.string().nullable(),
  explanation: z.string().nullable(),
});

export type ScreenUpdateIntentResult = z.infer<
  typeof screenUpdateIntentResultSchema
>;
