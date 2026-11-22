import "server-only";
import {
  EvaluatorDetailSchema,
  EvaluatorLibrarySchema,
} from "@kortyx/telemetry-contracts";
import { fetchJson } from "@/lib/studio-api";
export const readEvaluatorLibrary = () =>
  fetchJson("/v1/studio/evaluators", (v) => EvaluatorLibrarySchema.parse(v));
export const readEvaluatorDetail = (id: string) =>
  fetchJson(`/v1/studio/evaluators/${encodeURIComponent(id)}`, (v) =>
    EvaluatorDetailSchema.parse(v),
  );
