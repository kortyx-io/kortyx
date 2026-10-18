import { withEvalAttribution } from "@kortyx/core/eval-attribution";
import type { KortyxTelemetryEvent, ReasonTraceSpan } from "@kortyx/hooks";
import { expect, it } from "vitest";
import { createEventMapper } from "../src/event-mapper";
import { createTraceAdapter } from "../src/trace";

it("pins billing to the attempt that started a span, including delayed completion and child/retry spans", async () => {
  const events: KortyxTelemetryEvent[] = [];
  let id = 0;
  const createId = () => String(++id);
  const trace = createTraceAdapter({
    createId,
    enqueue: (event) => events.push(event),
    eventMapper: createEventMapper({
      environment: "test",
      service: { name: "app" },
      createId,
    }),
  });
  const spans: ReasonTraceSpan[] = [];
  await Promise.all(
    ["one", "two"].map((attemptId) =>
      withEvalAttribution({ attemptId, onExecution: () => {} }, async () => {
        await trace.withSpan!(
          {
            name: "parent",
            attributes: {
              runId: attemptId,
              sessionId: "shared-session",
              workflowId: "parent",
            },
          },
          async () => {
            await Promise.resolve();
            for (const workflowId of ["parent", "child", "retry"])
              spans.push(
                trace.startSpan!({
                  name: "runReasonEngine",
                  attributes: { workflowId },
                }),
              );
          },
        );
      }),
    ),
  );
  for (const span of spans)
    span.end?.({ providerMetadata: { providerId: "openrouter", cost: 0.001 } });
  const generations = events.filter(
    (event) => event.type === "generation.completed",
  );
  expect(generations).toHaveLength(6);
  for (const event of generations) {
    expect(event.payload.evalAttemptId).toBe(event.correlation.runId);
    expect(event.payload.pricing).toMatchObject({ actualCostMicros: 1000 });
  }
});
