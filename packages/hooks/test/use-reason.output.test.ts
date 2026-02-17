import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runWithHookContext } from "../src/context";
import { useReason } from "../src/hooks";
import { createNode, createProvider, createState } from "./helpers";

const PlanSchema = z.object({
  summary: z.string(),
  recommendation: z.string(),
  checklist: z.array(z.string()),
  userChoice: z.string(),
});

describe("useReason output flow", () => {
  it("parses JSON output and emits one structured patch", async () => {
    const response = JSON.stringify({
      summary: "Summary",
      recommendation: "Recommendation",
      checklist: ["item-1"],
      userChoice: "pending",
    });
    const { getProvider, invoke } = createProvider({
      invokeResponses: [response],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext(
      { node, state, getProvider },
      async () =>
        useReason({
          id: "reason-id",
          model: { providerId: "mock", modelId: "mock-model" },
          input: "Create a plan",
          stream: false,
          emit: true,
          outputSchema: PlanSchema,
          structured: {
            dataType: "reason.plan",
            stream: "patch",
          },
        }),
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual({
      summary: "Summary",
      recommendation: "Recommendation",
      checklist: ["item-1"],
      userChoice: "pending",
    });

    const structuredEvents = emitted.filter(
      (x) => x.event === "structured_data",
    );
    expect(structuredEvents).toHaveLength(1);
    const textEvents = emitted.filter((x) => x.event.startsWith("text-"));
    expect(textEvents).toHaveLength(0);
  });

  it("parses fenced JSON output when outputSchema is provided", async () => {
    const response = [
      "```json",
      "{",
      '  "summary": "Summary",',
      '  "recommendation": "Recommendation",',
      '  "checklist": ["item-1"],',
      '  "userChoice": "pending"',
      "}",
      "```",
    ].join("\n");

    const { getProvider } = createProvider({
      invokeResponses: [response],
    });
    const { node } = createNode();
    const state = createState();

    const { result } = await runWithHookContext(
      { node, state, getProvider },
      async () =>
        useReason({
          model: { providerId: "mock", modelId: "mock-model" },
          input: "Create a plan",
          stream: false,
          emit: true,
          outputSchema: PlanSchema,
        }),
    );

    expect(result.output?.summary).toBe("Summary");
  });

  it("throws when parsed output does not satisfy outputSchema", async () => {
    const response = JSON.stringify({
      summary: 123,
      recommendation: "Recommendation",
      checklist: ["item-1"],
      userChoice: "pending",
    });

    const { getProvider, invoke } = createProvider({
      invokeResponses: [response],
    });
    const { node } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state, getProvider }, async () =>
        useReason({
          model: { providerId: "mock", modelId: "mock-model" },
          input: "Create a plan",
          stream: false,
          emit: true,
          outputSchema: PlanSchema,
        }),
      ),
    ).rejects.toThrow("useReason output validation failed");

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("streams plain text when no outputSchema/interrupt is provided", async () => {
    const { getProvider, stream, invoke } = createProvider({
      streamResponses: ["hello ", "world"],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext(
      { node, state, getProvider },
      async () =>
        useReason({
          model: { providerId: "mock", modelId: "mock-model" },
          input: "Say hello",
          stream: true,
          emit: true,
        }),
    );

    expect(result.text).toBe("hello world");
    expect(stream).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(0);

    const textEvents = emitted.filter((x) => x.event.startsWith("text-"));
    expect(textEvents).toHaveLength(4);

    const structuredEvents = emitted.filter(
      (x) => x.event === "structured_data",
    );
    expect(structuredEvents).toHaveLength(0);
  });
});
