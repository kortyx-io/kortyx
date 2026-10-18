import {
  StudioCatalogsResponseSchema,
  StudioDetailEventSchema,
  StudioInterruptSchema,
  StudioRunSchema,
  StudioSessionSchema,
  StudioWorkflowsResponseSchema,
} from "@kortyx/telemetry-contracts";
import { createStudioReadModelsFromRecords } from "../repositories/studio-read-models";
import { createSampleExecutionRecords } from "./executions";

/** Pure, deterministic projection of synthetic events. Never opens a database. */
export function createSampleProjectReadModels(
  options: { runIds?: readonly string[] } = {},
) {
  const records = createSampleExecutionRecords();
  const models = createStudioReadModelsFromRecords({
    ...records,
    events: options.runIds
      ? records.events.filter((event) => options.runIds?.includes(event.runId))
      : records.events,
    rates: [],
  });
  return {
    runs: StudioRunSchema.array().parse(models.runs),
    sessions: StudioSessionSchema.array().parse(models.sessions),
    interrupts: StudioInterruptSchema.array().parse(models.interrupts),
    workflows: StudioWorkflowsResponseSchema.parse(models.workflows),
    catalogs: StudioCatalogsResponseSchema.parse(models.catalogs),
    detailEvents: StudioDetailEventSchema.array().parse(models.detailEvents),
  };
}
