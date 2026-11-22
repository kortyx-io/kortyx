import "server-only";
import {
  EvaluatorDetailSchema,
  EvaluatorExecutionSchema,
  EvaluatorLibrarySchema,
  ScoreGroupDetailSchema,
  ScoreGroupLibrarySchema,
  ScoreGroupVersionSchema,
} from "@kortyx/telemetry-contracts";
import { fetchJson } from "@/lib/studio-api";
import { EvaluatorRecordingsSchema } from "../schema";
export const readEvaluatorLibrary = () =>
  fetchJson("/v1/studio/evaluators", (v) => EvaluatorLibrarySchema.parse(v));
export const readEvaluatorDetail = (id: string) =>
  fetchJson(`/v1/studio/evaluators/${encodeURIComponent(id)}`, (v) =>
    EvaluatorDetailSchema.parse(v),
  );
export const readEvaluatorRecordings = () =>
  fetchJson("/v1/studio/evaluators/recordings", (v) =>
    EvaluatorRecordingsSchema.parse(v),
  );
export const readEvaluatorExecution = (id: string) =>
  fetchJson(`/v1/studio/evaluators/executions/${encodeURIComponent(id)}`, (v) =>
    EvaluatorExecutionSchema.parse(v),
  );
export const readScoreGroupLibrary = () =>
  fetchJson("/v1/studio/evaluators/score-groups", (value) =>
    ScoreGroupLibrarySchema.parse(value),
  );
export const readScoreGroupDetail = (id: string) =>
  fetchJson(
    `/v1/studio/evaluators/score-groups/${encodeURIComponent(id)}`,
    (value) => ScoreGroupDetailSchema.parse(value),
  );
export const readScoreGroupVersion = (ref: { id: string; version: number }) =>
  fetchJson(
    `/v1/studio/evaluators/score-groups/${encodeURIComponent(ref.id)}/versions/${ref.version}`,
    (value) => ScoreGroupVersionSchema.parse(value),
  );
