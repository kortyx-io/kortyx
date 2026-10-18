import { TableFiltersSchema } from "@kortyx/telemetry-contracts";
import { z } from "zod";

const SavedTableViewSchema = z.object({
  name: z.string().min(1).max(80),
  filters: TableFiltersSchema,
  layout: z.object({
    widths: z.record(z.string(), z.number().finite().positive()),
    order: z.array(z.string()).max(256),
    hidden: z.array(z.string()).max(256),
    pinned: z.record(z.string(), z.enum(["left", "right"]).optional()),
  }),
  scope: z
    .record(z.string().min(1).max(80), z.string().max(512))
    .refine((scope) => Object.keys(scope).length <= 32),
  sort: z.string().max(80).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  pageSize: z.number().int().min(1).max(250).optional(),
});
export type SavedTableView = z.infer<typeof SavedTableViewSchema>;
export function validView(value: unknown): value is SavedTableView {
  return SavedTableViewSchema.safeParse(value).success;
}
