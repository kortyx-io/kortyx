import "server-only";
import {
  PromptDetailSchema,
  PromptLibrarySchema,
} from "@kortyx/telemetry-contracts";
import { fetchJson } from "@/lib/studio-api";
export const readPromptLibrary = () =>
  fetchJson("/v1/studio/prompts", (value) => PromptLibrarySchema.parse(value));
export const readPromptDetail = (id: string, byKey = false) =>
  fetchJson(
    `/v1/studio/prompts/assets/${encodeURIComponent(id)}${byKey ? "?lookup=key" : ""}`,
    (value) => PromptDetailSchema.parse(value),
  );
