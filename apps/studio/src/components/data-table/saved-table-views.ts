import { StudioSavedViewDefinitionSchema } from "@kortyx/telemetry-contracts";
import { z } from "zod";

const SavedTableViewSchema = StudioSavedViewDefinitionSchema.extend({
  id: z.uuid().optional(),
});
export type SavedTableView = z.infer<typeof SavedTableViewSchema>;
export function validView(value: unknown): value is SavedTableView {
  return SavedTableViewSchema.safeParse(value).success;
}
