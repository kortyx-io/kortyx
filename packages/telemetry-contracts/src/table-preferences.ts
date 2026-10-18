import { z } from "zod";
import { TableFiltersSchema } from "./table-filters";

export const StudioTableIdSchema = z.enum([
  "runs",
  "sessions",
  "interrupts",
  "prompts",
  "prompt-groups",
  "prompt-runs",
  "prompt-evals",
  "evaluations",
  "eval-comparison",
  "eval-cases",
  "evaluation-suites",
  "legacy-eval-runs",
  "eval-suites",
]);
const key = z.string().min(1).max(80);
export const StudioTableLayoutSchema = z
  .object({
    widths: z
      .record(key, z.number().finite().min(1).max(10000))
      .refine((v) => Object.keys(v).length <= 256),
    order: z.array(key).max(256),
    hidden: z.array(key).max(256),
    pinned: z
      .record(key, z.enum(["left", "right"]).optional())
      .refine((v) => Object.keys(v).length <= 256),
  })
  .strict();
export const StudioTableQueryPreferencesSchema = z
  .object({
    sort: z.string().max(80),
    dir: z.enum(["asc", "desc"]),
    pageSize: z.number().int().min(1).max(250),
  })
  .strict();
/** Portable configuration only: ownership is always assigned by the receiving server. */
export const StudioSavedViewDefinitionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    filters: TableFiltersSchema,
    layout: StudioTableLayoutSchema,
    scope: z
      .record(key, z.string().max(512))
      .refine((v) => Object.keys(v).length <= 32),
    sort: z.string().max(80).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
    pageSize: z.number().int().min(1).max(250).optional(),
  })
  .strict();
export const StudioTableViewSchema = StudioSavedViewDefinitionSchema.extend({
  id: z.uuid(),
});
export const StudioTableDefaultsSchema = z
  .object({
    layout: StudioTableLayoutSchema.optional(),
    query: StudioTableQueryPreferencesSchema.optional(),
  })
  .strict();
export const StudioTableConfigurationSchema = z
  .object({
    schemaVersion: z.literal(1),
    defaults: StudioTableDefaultsSchema,
    views: z
      .array(StudioTableViewSchema)
      .max(30)
      .refine((v) => new Set(v.map((x) => x.id)).size === v.length),
  })
  .strict();
export const StudioTablePreferencesSchema =
  StudioTableConfigurationSchema.extend({ revision: z.number().int().min(0) });
export const StudioTablePreferenceScopeSchema = z.object({
  cacheKey: z.string().regex(/^[a-f0-9]{64}$/),
  ownerKind: z.enum(["project", "user"]),
});
export const StudioTablePreferenceOperationSchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({ kind: z.literal("defaults"), patch: StudioTableDefaultsSchema })
      .strict(),
    z
      .object({ kind: z.literal("putView"), view: StudioTableViewSchema })
      .strict(),
    z.object({ kind: z.literal("deleteView"), id: z.uuid() }).strict(),
  ],
);
export const StudioTablePreferenceWriteSchema = z
  .object({
    scopeKey: z.string().regex(/^[a-f0-9]{64}$/),
    expectedRevision: z.number().int().min(0),
    operation: StudioTablePreferenceOperationSchema,
  })
  .strict();
export type StudioTableConfiguration = z.infer<
  typeof StudioTableConfigurationSchema
>;
export type StudioTablePreferences = z.infer<
  typeof StudioTablePreferencesSchema
>;
export type StudioTablePreferenceScope = z.infer<
  typeof StudioTablePreferenceScopeSchema
>;
export type StudioTablePreferenceOperation = z.infer<
  typeof StudioTablePreferenceOperationSchema
>;
export type StudioTablePreferenceWrite = z.infer<
  typeof StudioTablePreferenceWriteSchema
>;
export type StudioTableDefaults = z.infer<typeof StudioTableDefaultsSchema>;
export type StudioTableView = z.infer<typeof StudioTableViewSchema>;
export function emptyTablePreferences(): StudioTablePreferences {
  return { schemaVersion: 1, revision: 0, defaults: {}, views: [] };
}
/** Used for optimistic cache updates and conflict-safe operation replay. */
export function applyTablePreferenceOperation(
  state: StudioTablePreferences,
  operation: StudioTablePreferenceOperation,
): StudioTablePreferences {
  if (operation.kind === "defaults")
    return { ...state, defaults: { ...state.defaults, ...operation.patch } };
  if (operation.kind === "deleteView")
    return {
      ...state,
      views: state.views.filter((v) => v.id !== operation.id),
    };
  const exists = state.views.some((v) => v.id === operation.view.id);
  return StudioTablePreferencesSchema.parse({
    ...state,
    views: exists
      ? state.views.map((v) =>
          v.id === operation.view.id ? operation.view : v,
        )
      : [...state.views, operation.view],
  });
}

export const StudioTablePreferenceResponseSchema = z.object({
  scope: StudioTablePreferenceScopeSchema,
  preferences: StudioTablePreferencesSchema,
});
