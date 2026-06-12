import { z } from "zod";

export const itemSchema = z.object({
  item_text: z.string(),
  item_rationale: z.string(),
});

export const sectionTypeSchema = z.enum([
  "user_segment",
  "pain_point",
  "job_to_be_done",
  "assumption",
  "solution_idea",
  "experiment",
  "risk",
  "metric",
  "open_question",
]);

export const sectionSchema = z.object({
  section_label: z.string(),
  section_summary: z.string(),
  section_rationale: z.string(),
  section_type: sectionTypeSchema,
  items: z.record(z.string(), itemSchema),
});

export const introItemSchema = z.object({
  /** Card title shown in the product brief header. */
  label: z.string(),
  /** One-line description under the card title. */
  summary: z.string(),
  item_text: z.string(),
});

export const canvasModeSchema = z.enum([
  "DISCOVERY_WORKSHOP",
  "EXECUTIVE_BRIEF",
]);

export type CanvasMode = z.infer<typeof canvasModeSchema>;

export const discoveryCanvasResponseSchema = z.object({
  title: z.string(),
  facilitator_style_id: z.string().nullable(),
  canvas_mode: canvasModeSchema,
  intro: introItemSchema,
  sections: z.record(z.string(), sectionSchema),
});

export type Item = z.infer<typeof itemSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type IntroItem = z.infer<typeof introItemSchema>;
export type DiscoveryCanvasResponse = z.infer<
  typeof discoveryCanvasResponseSchema
>;
