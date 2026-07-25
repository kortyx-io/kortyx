export type {
  TelemetryDb,
  TelemetryDbClient,
  TelemetrySqlClient,
} from "./client";
export { createTelemetryDbClient } from "./client";
export {
  TelemetryAuthError,
  TelemetryDbError,
  TelemetryForbiddenError,
  TelemetryNotFoundError,
} from "./errors";
export { DEFAULT_MODEL_RATE_CARDS } from "./pricing/default-rates";
export type {
  ApiKeyMode,
  AuthenticatedTelemetryProject,
  CreateTelemetryApiKeyInput,
  UpsertTelemetryApiKeyInput,
} from "./repositories/api-keys";
export {
  authenticateTelemetryApiKey,
  createTelemetryApiKey,
  hashTelemetryApiKeySecret,
  parseTelemetryApiKey,
  upsertTelemetryApiKey,
} from "./repositories/api-keys";
export {
  listApplicableModelRateCards,
  seedDefaultModelRateCards,
} from "./repositories/model-rate-cards";
export {
  ensureLocalDevelopmentProject,
  ensureProjectEnvironmentAllowed,
} from "./repositories/projects";
export {
  notifyStudioChange,
  STUDIO_CHANGE_CHANNEL,
} from "./repositories/studio-changes";
export type {
  StudioListPage,
  StudioListQuery,
} from "./repositories/studio-lists";
export {
  listStudioInterrupts,
  listStudioRuns,
  listStudioSessions,
} from "./repositories/studio-lists";
export type { StudioProjectionBackfillResult } from "./repositories/studio-projections";
export {
  backfillStudioProjections,
  refreshStudioProjectionScopes,
} from "./repositories/studio-projections";
export {
  createStudioReadModelsFromRecords,
  getStudioInterruptReadModel,
  getStudioReadModels,
  getStudioRunReadModel,
  getStudioSessionReadModel,
} from "./repositories/studio-read-models";
export type { IngestTelemetryEventsResult } from "./repositories/telemetry-events";
export { ingestTelemetryEvents } from "./repositories/telemetry-events";
export type { EnsureWorkflowRevisionResult } from "./repositories/workflow-revisions";
export {
  ensureWorkflowRevision,
  findWorkflowRevisionByTopology,
  findWorkflowRevisionForProject,
} from "./repositories/workflow-revisions";
