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

const ChoiceRequestSchema = z.object({
  kind: z.literal("choice"),
  question: z.string(),
  options: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
      }),
    )
    .min(1),
});

const ChoiceResponseSchema = z.string().min(1);

describe("useReason interrupt flow", () => {
  it("uses exactly first pass + continuation calls without extra request generation call", async () => {
    const first = JSON.stringify({
      output: {
        summary: "Draft summary",
        recommendation: "Draft recommendation",
        checklist: ["item-1"],
        userChoice: "pending",
      },
      draftText: "Draft text",
      interruptRequest: {
        kind: "choice",
        question: "Pick one",
        options: [{ id: "opt-1", label: "Option 1" }],
      },
    });

    const second = JSON.stringify({
      summary: "Final summary",
      recommendation: "Final recommendation",
      checklist: ["item-1"],
      userChoice: "opt-1",
    });

    const { getProvider, invoke } = createProvider({
      invokeResponses: [first, second],
    });
    const { node, emitted, interrupts } = createNode({
      interruptResponse: "opt-1",
    });
    const state = createState();

    const { result, memoryUpdates } = await runWithHookContext(
      { node, state, getProvider },
      async () =>
        useReason({
          id: "reason-id",
          model: { providerId: "mock", modelId: "mock-model" },
          input: "Create a launch plan",
          system: "Return structured output",
          stream: true,
          emit: true,
          outputSchema: PlanSchema,
          structured: {
            dataType: "reason.plan",
            stream: "patch",
            schemaId: "reason-plan",
            schemaVersion: "1",
          },
          interrupt: {
            requestSchema: ChoiceRequestSchema,
            responseSchema: ChoiceResponseSchema,
            schemaId: "reason-choice",
            schemaVersion: "1",
          },
        }),
    );

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(interrupts).toHaveLength(1);
    expect(result.output?.userChoice).toBe("opt-1");

    const interruptMeta = (interrupts[0] as { meta?: Record<string, unknown> })
      .meta;
    expect(interruptMeta?.__kortyxResumeMemory).toBeTruthy();

    const structuredEvents = emitted.filter(
      (x) => x.event === "structured_data",
    );
    expect(structuredEvents).toHaveLength(2);

    const textEvents = emitted.filter((x) => x.event.startsWith("text-"));
    expect(textEvents).toHaveLength(0);

    expect(memoryUpdates).toBeTruthy();
  });

  it("resumes from checkpointed first pass and skips re-running first pass model call", async () => {
    const resumeCheckpoint = {
      status: "awaiting_interrupt",
      request: {
        kind: "choice",
        question: "Pick one",
        options: [{ id: "opt-1", label: "Option 1" }],
      },
      firstText: "Draft text",
      firstOutput: {
        summary: "Draft summary",
        recommendation: "Draft recommendation",
        checklist: ["item-1"],
        userChoice: "pending",
      },
    };

    const memory = {
      __kortyx: {
        nodeState: {
          nodeId: "reason",
          state: {
            byIndex: [],
            byKey: {
              "__useReason:reason-id": resumeCheckpoint,
            },
          },
        },
        workflowState: {},
      },
    };

    const second = JSON.stringify({
      summary: "Final summary",
      recommendation: "Final recommendation",
      checklist: ["item-1"],
      userChoice: "accepted",
    });

    const { getProvider, invoke } = createProvider({
      invokeResponses: [second],
    });
    const { node, emitted, interrupts } = createNode({
      interruptResponse: "accepted",
    });
    const state = createState(memory);

    const { result, memoryUpdates } = await runWithHookContext(
      { node, state, getProvider },
      async () =>
        useReason({
          id: "reason-id",
          model: { providerId: "mock", modelId: "mock-model" },
          input: "Create a launch plan",
          outputSchema: PlanSchema,
          structured: {
            dataType: "reason.plan",
            stream: "patch",
          },
          interrupt: {
            requestSchema: ChoiceRequestSchema,
            responseSchema: ChoiceResponseSchema,
          },
        }),
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(1);
    expect(result.output?.userChoice).toBe("accepted");

    const structuredEvents = emitted.filter(
      (x) => x.event === "structured_data",
    );
    expect(structuredEvents).toHaveLength(1);

    const nextByKey = (
      memoryUpdates as {
        __kortyx?: {
          nodeState?: { state?: { byKey?: Record<string, unknown> } };
        };
      }
    ).__kortyx?.nodeState?.state?.byKey;
    expect(nextByKey).toBeDefined();
    expect(Object.hasOwn(nextByKey ?? {}, "__useReason:reason-id")).toBe(false);
  });

  it("fails fast when first pass interrupt payload does not match request schema", async () => {
    const badFirst = JSON.stringify({
      output: {
        summary: "Draft summary",
        recommendation: "Draft recommendation",
        checklist: ["item-1"],
        userChoice: "pending",
      },
      interruptRequest: null,
      draftText: "Draft text",
    });

    const { getProvider, invoke } = createProvider({
      invokeResponses: [badFirst],
    });
    const { node, interrupts } = createNode({
      interruptResponse: "opt-1",
    });
    const state = createState();

    await expect(
      runWithHookContext({ node, state, getProvider }, async () =>
        useReason({
          id: "reason-id",
          model: { providerId: "mock", modelId: "mock-model" },
          input: "Create a launch plan",
          outputSchema: PlanSchema,
          interrupt: {
            requestSchema: ChoiceRequestSchema,
            responseSchema: ChoiceResponseSchema,
          },
        }),
      ),
    ).rejects.toThrow("useReason interrupt.request validation failed");

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(0);
  });
});
