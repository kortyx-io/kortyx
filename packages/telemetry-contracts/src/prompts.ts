import {
  PromptContentSchema,
  PromptKeySchema,
  PromptVersionSchema,
} from "@kortyx/prompts";
import { z } from "zod";

const name = z.string().trim().min(1).max(200);
const version = z.number().int().positive();
const revision = z.number().int().nonnegative();
export const PromptCategorySchema = z.object({
  id: z.uuid(),
  name,
  parentId: z.uuid().nullable(),
  revision,
});
export const PromptGroupSchema = z.object({
  id: z.uuid(),
  name,
  revision,
  members: z
    .array(
      z.object({
        promptId: z.uuid(),
        version,
        key: PromptKeySchema.optional(),
        name: name.optional(),
        archived: z.boolean().optional(),
      }),
    )
    .max(100),
  updatedAt: z.string(),
});
export const PromptAssignmentSchema = z.object({
  environment: name,
  version,
  revision,
  updatedAt: z.string(),
});
export const PromptAssetSchema = z.object({
  id: z.uuid(),
  key: PromptKeySchema,
  name,
  categoryId: z.uuid().nullable(),
  latestVersion: version,
  revision,
  archived: z.boolean(),
  updatedAt: z.string(),
  assignments: z.array(PromptAssignmentSchema),
});
export const PromptLibrarySchema = z.object({
  schemaVersion: z.literal(1),
  assets: z.array(PromptAssetSchema),
  categories: z.array(PromptCategorySchema),
  environments: z.array(z.string()).optional(),
  groups: z.array(PromptGroupSchema),
  totalCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  permissions: z.object({
    edit: z.boolean(),
    promote: z.boolean(),
    review: z.boolean(),
    settings: z.boolean(),
  }),
});
export const PromptStoredVersionSchema = PromptVersionSchema.extend({
  promptId: z.uuid(),
  note: z.string(),
  author: z.string(),
  createdAt: z.string(),
  origin: z
    .object({
      apiUrl: z.string(),
      projectId: z.string(),
      key: z.string(),
      version,
      hash: z.string(),
    })
    .nullable(),
});
export const PromptPolicySchema = z.object({
  environment: name,
  revision,
  requireTest: z.boolean(),
  requiredSuites: z.array(z.object({ targetId: name, suiteId: name })).max(100),
  requiredReviews: z.number().int().min(0).max(10),
  allowException: z.boolean(),
});
export const PromptEvidenceSchema = z.object({
  environment: z.string(),
  runId: z.string(),
  evaluationId: z.string().nullable().optional(),
  targetId: z.string(),
  suiteId: z.string(),
  suiteRevision: z.string().optional(),
  status: z.string(),
  version,
  fullSuite: z.boolean(),
  usage: z.enum([
    "verified",
    "pending",
    "not-used",
    "mismatch",
    "context-differs",
  ]),
  groupName: z.string().nullable(),
  createdAt: z.string(),
  companions: z.array(z.object({ key: PromptKeySchema, version })),
});
export const PromptUsageSchema = z.object({
  eventId: z.string(),
  runId: z.string(),
  sessionId: z.string().nullable(),
  nodeId: z.string().nullable(),
  version: z.number().int(),
  hash: z.string().nullable(),
  source: z.string().nullable(),
  model: z.string().nullable(),
  environment: z.string(),
  occurredAt: z.string(),
  captured: z.boolean(),
});
export const PromptDetailSchema = z.object({
  asset: PromptAssetSchema,
  versions: z.array(PromptStoredVersionSchema),
  versionsNextCursor: z.string().nullable().optional(),
  draft: PromptContentSchema.nullable(),
  draftBase: z.number().int().nullable(),
  draftRevision: revision,
  evidence: z.array(PromptEvidenceSchema),
  usage: z.array(PromptUsageSchema),
  activity: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      actor: z.string(),
      details: z.record(z.string(), z.unknown()),
      createdAt: z.string(),
    }),
  ),
  policies: z.array(PromptPolicySchema),
  reviews: z
    .array(
      z.object({
        version,
        hash: z.string(),
        environment: z.string(),
        independent: z.boolean(),
        reviewer: z.string(),
        note: z.string(),
        createdAt: z.string(),
      }),
    )
    .optional(),
});
export const PromptMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("bulk-update"),
      assets: z
        .array(z.object({ id: z.uuid(), expectedRevision: revision }))
        .min(1)
        .max(100),
      categoryId: z.uuid().nullable().optional(),
      archived: z.boolean().optional(),
    })
    .strict()
    .refine(
      (value) => value.categoryId !== undefined || value.archived !== undefined,
      "Choose a category or archive state.",
    ),
  z
    .object({
      action: z.literal("create"),
      key: PromptKeySchema,
      name,
      categoryId: z.uuid().nullable().default(null),
      content: PromptContentSchema,
      note: z.string().trim().min(1).max(2000),
      idempotencyKey: z.uuid().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("draft"),
      id: z.uuid(),
      content: PromptContentSchema,
      baseVersion: version,
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      action: z.literal("discard-draft"),
      id: z.uuid(),
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      action: z.literal("save"),
      id: z.uuid(),
      content: PromptContentSchema,
      baseVersion: version,
      expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
      expectedDraftRevision: revision.optional(),
      note: z.string().trim().min(1).max(2000),
      idempotencyKey: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      id: z.uuid(),
      expectedRevision: revision,
      name: name.optional(),
      categoryId: z.uuid().nullable().optional(),
      archived: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("category-create"),
      path: z.string().trim().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("category-update"),
      id: z.uuid(),
      expectedRevision: revision,
      name: name.optional(),
      parentId: z.uuid().nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("category-delete"),
      id: z.uuid(),
      expectedRevision: revision,
      destinationId: z.uuid().nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("group-create"),
      name,
      members: z
        .array(z.object({ promptId: z.uuid(), version }))
        .max(100)
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("group-update"),
      id: z.uuid(),
      expectedRevision: revision,
      name: name.optional(),
      members: z
        .array(z.object({ promptId: z.uuid(), version }))
        .max(100)
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("group-delete"),
      id: z.uuid(),
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      action: z.literal("promote"),
      id: z.uuid(),
      version,
      environment: name,
      expectedRevision: revision,
      exceptionReason: z.string().trim().min(10).max(2000).optional(),
      rollback: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      id: z.uuid(),
      version,
      environment: name,
      note: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({ action: z.literal("policy"), policy: PromptPolicySchema })
    .strict(),
]);
export type PromptLibrary = z.infer<typeof PromptLibrarySchema>;
export type PromptDetail = z.infer<typeof PromptDetailSchema>;
export type PromptMutation = z.infer<typeof PromptMutationSchema>;
export type PromptCategory = z.infer<typeof PromptCategorySchema>;
export type PromptGroup = z.infer<typeof PromptGroupSchema>;
export type PromptEvidence = z.infer<typeof PromptEvidenceSchema>;

export const PromptSelectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("production") }).strict(),
  z
    .object({
      type: z.literal("single"),
      id: z.string().min(1),
      version: z.number().int().positive(),
    })
    .strict(),
  z.object({ type: z.literal("group"), groupId: z.uuid() }).strict(),
]);
export type PromptSelection = z.infer<typeof PromptSelectionSchema>;
export const PromptBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    origin: z
      .object({
        apiUrl: z.url().refine((value) => {
          const url = new URL(value);
          return (
            /^https?:$/.test(url.protocol) &&
            !url.username &&
            !url.password &&
            !url.search
          );
        }),
        projectId: z.string().min(1),
      })
      .strict(),
    prompts: z
      .array(
        z
          .object({
            key: PromptKeySchema,
            name,
            categoryPath: z.string().optional(),
            versions: z
              .array(PromptVersionSchema.extend({ note: z.string().max(2000) }))
              .min(1)
              .max(200),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    groups: z
      .array(
        z
          .object({
            name,
            members: z
              .array(z.object({ key: PromptKeySchema, version }))
              .max(100),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();
export const PromptTransferRequestSchema = z
  .object({
    bundle: PromptBundleSchema,
    conflicts: z.enum(["error", "append"]).default("error"),
    rename: z.record(PromptKeySchema, PromptKeySchema).default({}),
    categories: z.boolean().default(true),
    groups: z.boolean().default(false),
  })
  .strict();
export type PromptBundle = z.infer<typeof PromptBundleSchema>;
export type PromptTransferRequest = z.infer<typeof PromptTransferRequestSchema>;
