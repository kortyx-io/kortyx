import { DEFAULT_ASSESSMENT_GROUP } from "@kortyx/telemetry-contracts";
import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  schema: undefined as unknown,
  content:
    '{"scores":{"assessment":{"status":"scored","value":"The recorded answer is supported.","evidence":[{"recordingId":"recording-hash","path":"/captured/output"}]}}}',
}));
vi.mock("@kortyx/openai", () => ({
  createOpenAI: () => {
    const provider = {
      id: "openai",
      getModel: (
        _id: string,
        options: { responseFormat: { schema: unknown } },
      ) => {
        fixture.schema = options.responseFormat.schema;
        return {
          invoke: async () => ({
            content: fixture.content,
            usage: { input: 30, output: 20 },
            finishReason: { unified: "stop" },
          }),
        };
      },
    };
    return (_model: string) => ({ provider });
  },
}));

import { loadEvaluatorModels } from "../src/evaluators/model";

function requireAllProperties(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const schema = value as Record<string, unknown>;
  if (schema.type === "object" && schema.properties) {
    expect(schema.required).toEqual(Object.keys(schema.properties));
    expect(schema.additionalProperties).toBe(false);
  }
  for (const child of Object.values(schema)) {
    if (Array.isArray(child)) child.forEach(requireAllProperties);
    else requireAllProperties(child);
  }
}
describe("Judge provider output contract", () => {
  it("uses provider-compatible required fields and validates recording references", async () => {
    const service = loadEvaluatorModels({
      KORTYX_EVAL_JUDGE_API_KEY: "test-only-key",
      KORTYX_EVAL_JUDGE_MODEL: "test/judge",
    });
    expect(service).toBeDefined();
    if (!service) throw new Error("Fixture service missing");
    const result = await service.invoke(
      "test/judge",
      [{ role: "user", content: "Recorded evidence" }],
      AbortSignal.timeout(1000),
      () => {},
      {
        group: DEFAULT_ASSESSMENT_GROUP,
        evidenceId: "recording-hash",
        eventIds: [],
      },
    );
    requireAllProperties(fixture.schema);
    expect(result).toEqual({
      scores: [
        {
          fieldId: "assessment",
          status: "scored",
          value: "The recorded answer is supported.",
          evidence: [
            { recordingId: "recording-hash", path: "/captured/output" },
          ],
        },
      ],
    });
  });
  it("retains reported usage before rejecting malformed output", async () => {
    const service = loadEvaluatorModels({
      KORTYX_EVAL_JUDGE_API_KEY: "test-only-key",
      KORTYX_EVAL_JUDGE_MODEL: "test/judge",
    });
    if (!service) throw new Error("Fixture service missing");
    const onUsage = vi.fn();
    fixture.content = "invalid JSON";
    try {
      await expect(
        service.invoke("test/judge", [], AbortSignal.timeout(1000), onUsage, {
          group: DEFAULT_ASSESSMENT_GROUP,
          evidenceId: "recording-hash",
          eventIds: [],
        }),
      ).rejects.toThrow();
      expect(onUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTokens: 30,
          outputTokens: 20,
          costUsd: null,
        }),
      );
    } finally {
      fixture.content =
        '{"scores":{"assessment":{"status":"scored","value":"The recorded answer is supported.","evidence":[]}}}';
    }
  });
});
