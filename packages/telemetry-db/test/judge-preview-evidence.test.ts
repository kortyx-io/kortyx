import { DEFAULT_JUDGE_CONTENT } from "@kortyx/telemetry-contracts";
import { describe, expect, it } from "vitest";
import {
  type EvaluatorEvidence,
  evaluatorVariables,
  renderEvaluatorMessages,
  resolveEvaluatorSnapshot,
  validateEvaluatorPreviewEvidence,
} from "../src/repositories/evaluators";

const snapshot = (evidence: "response" | "trajectory" = "response") =>
  resolveEvaluatorSnapshot({
    name: "Intent review",
    description: "",
    content: DEFAULT_JUDGE_CONTENT,
    model: "test/model",
    evidence,
  });
const recording = (captured: unknown): EvaluatorEvidence => ({
  target: { type: "run", runId: "run", environment: "test" },
  environment: "test",
  revision: "recorded",
  captured,
  omitted: [],
  eventIds: [],
});

describe("judge preview evidence", () => {
  it("renders the captured user request and final response without intermediate events", () => {
    const evidence = recording({
      status: "completed",
      input: "Help me reset my password",
      output: "support",
      events: [],
    });
    expect(evaluatorVariables(evidence)).toMatchObject({
      input: "Help me reset my password",
      observation: { text: "support", events: [], structured: [] },
    });
    expect(() =>
      validateEvaluatorPreviewEvidence(snapshot(), evidence),
    ).not.toThrow();
    const rendered = renderEvaluatorMessages(snapshot(), evidence).at(
      -1,
    )?.content;
    expect(rendered).toContain("Help me reset my password");
    expect(rendered).toContain("support");
  });

  it("rejects a content-free recording before creating a billable preview", () => {
    const evidence = recording({
      status: "completed",
      input: null,
      output: null,
      events: [],
    });
    expect(evaluatorVariables(evidence).input).toBeNull();
    expect(() =>
      validateEvaluatorPreviewEvidence(snapshot(), evidence),
    ).toThrow("This recording has no captured final response.");
  });

  it("accepts structured final output without inventing response text or a missing input", () => {
    const evidence = recording({
      status: "completed",
      input: null,
      output: { intent: "sales" },
      events: [],
    });
    expect(evaluatorVariables(evidence)).toMatchObject({
      input: null,
      observation: { text: "", structured: [{ intent: "sales" }] },
    });
    expect(() =>
      validateEvaluatorPreviewEvidence(snapshot(), evidence),
    ).not.toThrow();
  });

  it("keeps older full-event recordings readable and permits event-based judgments", () => {
    const evidence = recording({
      status: "completed",
      events: [
        {
          type: "span.started",
          payload: {
            name: "kortyx.run",
            input: "I want to buy a subscription",
          },
        },
        { type: "tool.completed", payload: { toolName: "lookup-plan" } },
        {
          type: "span.ended",
          payload: { name: "kortyx.run", output: "sales" },
        },
      ],
    });
    expect(evaluatorVariables(evidence)).toMatchObject({
      input: "I want to buy a subscription",
      observation: {
        text: "sales",
        events: expect.arrayContaining([
          { type: "tool.completed", payload: { toolName: "lookup-plan" } },
        ]),
      },
    });
    expect(() =>
      validateEvaluatorPreviewEvidence(
        snapshot("trajectory"),
        recording({
          status: "completed",
          events: [
            { type: "tool.completed", payload: { toolName: "lookup-plan" } },
          ],
        }),
      ),
    ).not.toThrow();
  });
});
