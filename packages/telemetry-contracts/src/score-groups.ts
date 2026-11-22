import { z } from "zod";

const label = z.string().trim().min(1).max(200);
const key = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const common = {
  id: key,
  label,
  description: z.string().trim().min(1).max(4000),
  allowNotApplicable: z.boolean().default(true),
  allowInsufficientEvidence: z.boolean().default(true),
};
export const ScoreFieldSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...common,
      type: z.literal("text"),
      minLength: z.number().int().min(1).max(16000),
      maxLength: z.number().int().min(1).max(16000),
    })
    .strict(),
  z.object({ ...common, type: z.literal("boolean") }).strict(),
  z
    .object({
      ...common,
      type: z.literal("number"),
      preset: z.enum(["score", "rating", "custom"]),
      min: z.number().finite(),
      max: z.number().finite(),
      integer: z.boolean(),
      direction: z.enum(["higher", "lower", "none"]),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("category"),
      multiple: z.boolean(),
      options: z
        .array(
          z
            .object({ id: key, label, description: z.string().max(2000) })
            .strict(),
        )
        .min(2)
        .max(50),
    })
    .strict(),
]);
export type ScoreField = z.infer<typeof ScoreFieldSchema>;
export const ASSESSMENT_FIELD: ScoreField = {
  id: "assessment",
  label: "Assessment",
  type: "text",
  description:
    "Explain the conclusion, supporting evidence and any limitations concisely.",
  minLength: 1,
  maxLength: 4000,
  allowNotApplicable: false,
  allowInsufficientEvidence: false,
};
export const DEFAULT_SCORE_GROUP_REF = {
  id: "00000000-0000-4000-8000-000000000020",
  version: 1,
} as const;
export const ScoreGroupReferenceSchema = z
  .object({ id: z.uuid(), version: z.number().int().positive() })
  .strict();
export const ScoreGroupDefinitionSchema = z
  .object({
    name: label,
    description: z.string().max(2000).default(""),
    fields: z.array(ScoreFieldSchema).min(1).max(20),
  })
  .strict()
  .superRefine((group, ctx) => {
    const ids = new Set<string>();
    group.fields.forEach((field, index) => {
      const issue = (message: string) =>
        ctx.addIssue({ code: "custom", path: ["fields", index], message });
      if (ids.has(field.id)) issue("Field keys must be unique.");
      ids.add(field.id);
      if (field.type === "text" && field.minLength > field.maxLength)
        issue("Minimum length cannot exceed maximum length.");
      if (field.type === "number") {
        if (field.min >= field.max) issue("Maximum must exceed minimum.");
        if (
          field.integer &&
          (!Number.isInteger(field.min) || !Number.isInteger(field.max))
        )
          issue("Integer bounds must be whole numbers.");
        if (
          field.preset === "score" &&
          (field.min !== 0 || field.max !== 1 || field.integer)
        )
          issue("Score uses decimal values from 0 to 1.");
        if (field.preset === "rating" && !field.integer)
          issue("Rating uses whole numbers.");
      }
      if (
        field.type === "category" &&
        new Set(field.options.map((option) => option.id)).size !==
          field.options.length
      )
        issue("Category keys must be unique.");
    });
    const assessment = group.fields.find((field) => field.id === "assessment");
    if (
      !assessment ||
      assessment.type !== "text" ||
      assessment.allowNotApplicable ||
      assessment.allowInsufficientEvidence
    )
      ctx.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Every group needs a required Assessment text field.",
      });
  });
export type ScoreGroupDefinition = z.infer<typeof ScoreGroupDefinitionSchema>;
export const ScoreGroupMetadataSchema = z
  .object({
    name: ScoreGroupDefinitionSchema.shape.name,
    description: ScoreGroupDefinitionSchema.shape.description,
  })
  .strict();

export const ScoreGroupVersionSchema = z.object({
  groupId: z.uuid(),
  version: z.number().int().positive(),
  definition: ScoreGroupDefinitionSchema,
  createdAt: z.string(),
});
export type ScoreGroupVersion = z.infer<typeof ScoreGroupVersionSchema>;
export const ASSESSMENT_SCORE_GROUP: ScoreGroupVersion = {
  groupId: DEFAULT_SCORE_GROUP_REF.id,
  version: 1,
  definition: {
    name: "Assessment",
    description:
      "A written assessment with supporting context and limitations.",
    fields: [ASSESSMENT_FIELD],
  },
  createdAt: "2026-11-22T00:00:00.000Z",
};
export const ScoreGroupAssetSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  publishedVersion: z.number().int().nonnegative(),
  archived: z.boolean(),
  builtin: z.boolean(),
  draft: ScoreGroupDefinitionSchema,
  updatedAt: z.string(),
  latest: ScoreGroupVersionSchema.nullable(),
});
export const ScoreGroupLibrarySchema = z.object({
  groups: z.array(ScoreGroupAssetSchema),
  canEdit: z.boolean(),
});
export const ScoreGroupDetailSchema = z.object({
  group: ScoreGroupAssetSchema,
  versions: z.array(ScoreGroupVersionSchema),
});
export type ScoreGroupAsset = z.infer<typeof ScoreGroupAssetSchema>;
export type ScoreGroupLibrary = z.infer<typeof ScoreGroupLibrarySchema>;
export type ScoreGroupDetail = z.infer<typeof ScoreGroupDetailSchema>;
export const ScoreGroupResultSchema = z
  .object({
    group: ScoreGroupVersionSchema,
    fields: z.record(
      z.string(),
      z
        .object({
          status: z.enum(["scored", "not_applicable", "insufficient_evidence"]),
          value: z
            .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
            .nullable(),
          reason: z.string(),
          evidence: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((result, ctx) => {
    const validated = scoreGroupOutputSchema(result.group.definition).safeParse(
      result.fields,
    );
    if (!validated.success)
      for (const issue of validated.error.issues)
        ctx.addIssue({ ...issue, path: ["fields", ...issue.path] });
  });
export type ScoreGroupResult = z.infer<typeof ScoreGroupResultSchema>;

/** Build both provider structured-output and runtime validation from one definition. */
export function scoreGroupOutputSchema(definition: ScoreGroupDefinition) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of ScoreGroupDefinitionSchema.parse(definition).fields) {
    let value: z.ZodType;
    if (field.type === "text")
      value = z.string().trim().min(field.minLength).max(field.maxLength);
    else if (field.type === "boolean") value = z.boolean();
    else if (field.type === "number")
      value = (field.integer ? z.number().int() : z.number())
        .min(field.min)
        .max(field.max);
    else {
      const choice = z.enum(
        field.options.map((option) => option.id) as [string, ...string[]],
      );
      value = field.multiple
        ? z
            .array(choice)
            .min(0)
            .max(field.options.length)
            .refine(
              (items) => new Set(items).size === items.length,
              "Category selections must be unique.",
            )
        : choice;
    }
    const states = [
      "scored",
      ...(field.allowNotApplicable ? ["not_applicable"] : []),
      ...(field.allowInsufficientEvidence ? ["insufficient_evidence"] : []),
    ] as [string, ...string[]];
    // Required nullable value keeps provider JSON-schema support portable.
    shape[field.id] = z
      .object({
        status: z.enum(states),
        value: value.nullable(),
        reason: z.string().trim().min(1).max(4000),
        evidence: z.array(z.string().max(4000)).max(20),
      })
      .strict()
      .superRefine((result, ctx) => {
        if ((result.status === "scored") === (result.value === null))
          ctx.addIssue({
            code: "custom",
            path: ["value"],
            message: "Scored fields require a value; abstentions require null.",
          });
      });
  }
  return z.object(shape).strict();
}
