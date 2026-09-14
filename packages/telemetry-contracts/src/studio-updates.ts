import { z } from "zod";

export const StudioReleaseVersionSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);

export const StudioReleaseSchema = z.object({
  format: z.literal(1),
  installer: z.literal(1),
  version: StudioReleaseVersionSchema,
  api: z
    .string()
    .regex(/^ghcr\.io\/kortyx-io\/kortyx-api@sha256:[a-f0-9]{64}$/),
  studio: z
    .string()
    .regex(/^ghcr\.io\/kortyx-io\/kortyx-studio@sha256:[a-f0-9]{64}$/),
});
export type StudioRelease = z.infer<typeof StudioReleaseSchema>;

export const StudioUpdateSettingsSchema = z.object({
  automatic: z.boolean(),
  hourUtc: z.number().int().min(0).max(23),
});
export type StudioUpdateSettings = z.infer<typeof StudioUpdateSettingsSchema>;

export const StudioUpdateOperationSchema = z.object({
  id: z.uuid(),
  from: z.string(),
  release: StudioReleaseSchema,
  phase: z.enum([
    "starting",
    "pulling",
    "backup",
    "installing",
    "verifying",
    "succeeded",
    "failed",
  ]),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  backup: z.string().nullable(),
  messages: z.array(z.string()).max(100),
});
export type StudioUpdateOperation = z.infer<typeof StudioUpdateOperationSchema>;

export const StudioUpdateStatusSchema = z.object({
  current: z.string().nullable(),
  available: StudioReleaseSchema.nullable(),
  checkedAt: z.iso.datetime().nullable(),
  checkError: z.string().nullable(),
  settings: StudioUpdateSettingsSchema,
  operation: StudioUpdateOperationSchema.nullable(),
});
export type StudioUpdateStatus = z.infer<typeof StudioUpdateStatusSchema>;

export function newerStudioVersion(
  candidate: string,
  current: string,
): boolean {
  const next = StudioReleaseVersionSchema.parse(candidate)
    .split(".")
    .map(BigInt);
  const previous = StudioReleaseVersionSchema.parse(current)
    .split(".")
    .map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (next[i] !== previous[i]) return (next[i] ?? 0n) > (previous[i] ?? 0n);
  }
  return false;
}

export function studioUpdateRunning(
  operation: StudioUpdateOperation | null,
): boolean {
  return (
    !!operation &&
    operation.phase !== "succeeded" &&
    operation.phase !== "failed"
  );
}
