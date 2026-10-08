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
  TelemetryValidationError,
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
  appendEvalProgress,
  claimEvalRun,
  enqueueEvalRun,
  finishEvalRun,
  getEvalRun,
  heartbeatEvalRun,
  listEvalRuns,
  requestEvalCancellation,
} from "./repositories/evals";
export {
  listApplicableModelRateCards,
  seedDefaultModelRateCards,
} from "./repositories/model-rate-cards";
export type { StudioProjectContext } from "./repositories/projects";
export {
  ensureLocalDevelopmentProject,
  ensureProjectEnvironmentAllowed,
  getStudioProjectContext,
} from "./repositories/projects";
export {
  applyPromptTransfer,
  exportPrompts,
  planPromptTransfer,
} from "./repositories/prompt-transfer";
export {
  getPrompt,
  listPrompts,
  mutatePrompt,
  type PromptScope,
  promptEvidence,
  resolvePrompts,
} from "./repositories/prompts";
export {
  clearRunScore,
  listRunScores,
  upsertRunScore,
  withRunFeedback,
} from "./repositories/scores";
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
export {
  createStudioWorkflowModelsFromProjections,
  listStudioWorkflows,
} from "./repositories/studio-workflows";
export type { IngestTelemetryEventsResult } from "./repositories/telemetry-events";
export { ingestTelemetryEvents } from "./repositories/telemetry-events";
export type { EnsureWorkflowRevisionResult } from "./repositories/workflow-revisions";
export {
  ensureWorkflowRevision,
  findWorkflowRevisionByTopology,
  findWorkflowRevisionForProject,
} from "./repositories/workflow-revisions";
export { withProjectTelemetryScope } from "./scope-policy";
