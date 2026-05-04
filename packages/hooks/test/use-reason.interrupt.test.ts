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
  it("lets optional interrupt mode continue with a single model call", async () => {
    const first = JSON.stringify({
      decision: "continue",
      output: {
        summary: "Final summary",
        recommendation: "Final recommendation",
        checklist: ["item-1"],
        userChoice: "not-needed",
      },
      interruptRequest: null,
      draftText: "Final summary",
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [first],
    });
    const { node, interrupts } = createNode({
      interruptResponse: "opt-1",
    });
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        id: "reason-id",
        model: modelRef,
        input: "Create a launch plan",
        outputSchema: PlanSchema,
        interrupt: {
          mode: "optional",
          requestSchema: ChoiceRequestSchema,
          responseSchema: ChoiceResponseSchema,
        },
      }),
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(0);
    expect(result.output?.userChoice).toBe("not-needed");
    expect(result.interruptResponse).toBeUndefined();
  });

  it("emits structured final output when optional interrupt mode continues", async () => {
    const first = JSON.stringify({
      decision: "continue",
      output: {
        summary: "Final summary",
        recommendation: "Final recommendation",
        checklist: ["item-1"],
        userChoice: "not-needed",
      },
      interruptRequest: null,
      draftText: "Final summary",
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [first],
    });
    const { node, emitted, interrupts } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        id: "reason-id",
        model: modelRef,
        input: "Create a launch plan",
        outputSchema: PlanSchema,
        structured: {
          dataType: "reason.plan",
          stream: true,
          schemaId: "reason-plan",
          schemaVersion: "1",
        },
        interrupt: {
          mode: "optional",
          requestSchema: ChoiceRequestSchema,
          responseSchema: ChoiceResponseSchema,
        },
      }),
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(0);
    expect(result.output?.userChoice).toBe("not-needed");

    const structuredEvents = emitted.filter(
      (x) => x.event === "structured_data",
    );
    expect(structuredEvents).toHaveLength(1);
    expect(structuredEvents[0]?.payload).toMatchObject({
      kind: "final",
      dataType: "reason.plan",
      schemaId: "reason-plan",
      schemaVersion: "1",
      id: "reason-id",
      data: {
        userChoice: "not-needed",
      },
    });
  });

  it("lets optional interrupt mode continue without an output schema", async () => {
    const first = JSON.stringify({
      decision: "continue",
      draftText: "Plain final answer",
      interruptRequest: null,
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [first],
    });
    const { node, interrupts } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Answer directly unless user input is needed",
        interrupt: {
          mode: "optional",
          requestSchema: ChoiceRequestSchema,
          responseSchema: ChoiceResponseSchema,
        },
      }),
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(0);
    expect(result.text).toBe("Plain final answer");
    expect(result.output).toBeUndefined();
    expect(result.interruptResponse).toBeUndefined();
  });

  it("lets optional interrupt mode interrupt and continue when user input is needed", async () => {
    const first = JSON.stringify({
      decision: "interrupt",
      output: {
        summary: "Draft summary",
        recommendation: "Draft recommendation",
        checklist: ["item-1"],
        userChoice: "pending",
      },
      interruptRequest: {
        kind: "choice",
        question: "Pick one",
        options: [{ id: "opt-1", label: "Option 1" }],
      },
      draftText: "Draft summary",
    });

    const second = JSON.stringify({
      summary: "Final summary",
      recommendation: "Final recommendation",
      checklist: ["item-1"],
      userChoice: "opt-1",
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [first, second],
    });
    const { node, interrupts } = createNode({
      interruptResponse: "opt-1",
    });
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        id: "reason-id",
        model: modelRef,
        input: "Create a launch plan",
        outputSchema: PlanSchema,
        interrupt: {
          mode: "optional",
          requestSchema: ChoiceRequestSchema,
          responseSchema: ChoiceResponseSchema,
        },
      }),
    );

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(interrupts).toHaveLength(1);
    expect(result.output?.userChoice).toBe("opt-1");
    expect(result.interruptResponse).toBe("opt-1");
  });

  it("lets optional interrupt mode interrupt without an output schema", async () => {
    const first = JSON.stringify({
      decision: "interrupt",
      draftText: "Draft answer",
      interruptRequest: {
        kind: "choice",
        question: "Pick one",
        options: [{ id: "opt-1", label: "Option 1" }],
      },
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [first, "Final answer"],
    });
    const { node, interrupts } = createNode({
      interruptResponse: "opt-1",
    });
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Answer directly unless user input is needed",
        interrupt: {
          mode: "optional",
          requestSchema: ChoiceRequestSchema,
          responseSchema: ChoiceResponseSchema,
        },
      }),
    );

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(interrupts).toHaveLength(1);
    expect(result.text).toBe("Final answer");
    expect(result.output).toBeUndefined();
    expect(result.interruptResponse).toBe("opt-1");
  });

  it("fails fast when optional interrupt mode omits the decision", async () => {
    const first = JSON.stringify({
      output: {
        summary: "Final summary",
        recommendation: "Final recommendation",
        checklist: ["item-1"],
        userChoice: "not-needed",
      },
      interruptRequest: null,
      draftText: "Final summary",
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [first],
    });
    const { node, interrupts } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create a launch plan",
          outputSchema: PlanSchema,
          interrupt: {
            mode: "optional",
            requestSchema: ChoiceRequestSchema,
            responseSchema: ChoiceResponseSchema,
          },
        }),
      ),
    ).rejects.toThrow(
      'useReason optional interrupt first pass must include decision "continue" or "interrupt".',
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(0);
  });

  it("fails fast when optional interrupt mode returns an invalid decision", async () => {
    const first = JSON.stringify({
      decision: "maybe",
      output: {
        summary: "Final summary",
        recommendation: "Final recommendation",
        checklist: ["item-1"],
        userChoice: "not-needed",
      },
      interruptRequest: null,
      draftText: "Final summary",
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [first],
    });
    const { node, interrupts } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create a launch plan",
          outputSchema: PlanSchema,
          interrupt: {
            mode: "optional",
            requestSchema: ChoiceRequestSchema,
            responseSchema: ChoiceResponseSchema,
          },
        }),
      ),
    ).rejects.toThrow(
      'useReason optional interrupt first pass must include decision "continue" or "interrupt".',
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(0);
  });

  it("fails fast when optional continue includes an interrupt request", async () => {
    const first = JSON.stringify({
      decision: "continue",
      output: {
        summary: "Final summary",
        recommendation: "Final recommendation",
        checklist: ["item-1"],
        userChoice: "not-needed",
      },
      interruptRequest: {
        kind: "choice",
        question: "Pick one",
        options: [{ id: "opt-1", label: "Option 1" }],
      },
      draftText: "Final summary",
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [first],
    });
    const { node, interrupts } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create a launch plan",
          outputSchema: PlanSchema,
          interrupt: {
            mode: "optional",
            requestSchema: ChoiceRequestSchema,
            responseSchema: ChoiceResponseSchema,
          },
        }),
      ),
    ).rejects.toThrow(
      'useReason optional interrupt first pass with decision "continue" must not include an interrupt request.',
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(0);
  });

  it("fails fast when optional interrupt has an invalid interrupt request", async () => {
    const first = JSON.stringify({
      decision: "interrupt",
      output: {
        summary: "Draft summary",
        recommendation: "Draft recommendation",
        checklist: ["item-1"],
        userChoice: "pending",
      },
      interruptRequest: null,
      draftText: "Draft summary",
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [first],
    });
    const { node, interrupts } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create a launch plan",
          outputSchema: PlanSchema,
          interrupt: {
            mode: "optional",
            requestSchema: ChoiceRequestSchema,
            responseSchema: ChoiceResponseSchema,
          },
        }),
      ),
    ).rejects.toThrow("useReason interrupt.request validation failed");

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(0);
  });

  it("fails fast when optional continue output does not match the output schema", async () => {
    const first = JSON.stringify({
      decision: "continue",
      output: {
        summary: "Final summary",
        recommendation: "Final recommendation",
        checklist: ["item-1"],
      },
      interruptRequest: null,
      draftText: "Final summary",
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [first],
    });
    const { node, interrupts } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create a launch plan",
          outputSchema: PlanSchema,
          interrupt: {
            mode: "optional",
            requestSchema: ChoiceRequestSchema,
            responseSchema: ChoiceResponseSchema,
          },
        }),
      ),
    ).rejects.toThrow("useReason output validation failed");

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(0);
  });

  it("requires draftText for optional continue without an output schema", async () => {
    const first = JSON.stringify({
      decision: "continue",
      interruptRequest: null,
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [first],
    });
    const { node, interrupts } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Answer directly unless user input is needed",
          interrupt: {
            mode: "optional",
            requestSchema: ChoiceRequestSchema,
            responseSchema: ChoiceResponseSchema,
          },
        }),
      ),
    ).rejects.toThrow(
      "useReason first pass with interrupt requires `draftText` when outputSchema is not provided.",
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(0);
  });

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

    const { invoke, modelRef } = createProvider({
      invokeResponses: [first, second],
    });
    const { node, emitted, interrupts } = createNode({
      interruptResponse: "opt-1",
    });
    const state = createState();

    const { result, runtimeUpdates } = await runWithHookContext(
      { node, state },
      async () =>
        useReason({
          id: "reason-id",
          model: modelRef,
          input: "Create a launch plan",
          system: "Return structured output",
          stream: true,
          emit: true,
          outputSchema: PlanSchema,
          structured: {
            dataType: "reason.plan",
            stream: true,
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
    expect(interruptMeta?.__kortyxResumeStatePatch).toBeTruthy();

    const structuredEvents = emitted.filter(
      (x) => x.event === "structured_data",
    );
    expect(structuredEvents).toHaveLength(1);

    const textEvents = emitted.filter((x) => x.event.startsWith("text-"));
    expect(textEvents).toHaveLength(0);

    expect(runtimeUpdates).toBeTruthy();
  });

  it("aggregates normalized usage across interrupt first-pass and continuation calls", async () => {
    const { modelRef } = createProvider({
      invokeResponses: [
        {
          content: JSON.stringify({
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
          }),
          usage: {
            input: 10,
            output: 6,
            total: 16,
          },
          warnings: [
            {
              type: "other",
              message: "first-pass warning",
            },
          ],
          providerMetadata: {
            firstPassId: "call-1",
          },
        },
        {
          content: JSON.stringify({
            summary: "Final summary",
            recommendation: "Final recommendation",
            checklist: ["item-1"],
            userChoice: "opt-1",
          }),
          usage: {
            input: 12,
            output: 8,
            total: 20,
          },
          finishReason: {
            unified: "stop",
            raw: "STOP",
          },
          warnings: [
            {
              type: "other",
              message: "continuation warning",
            },
          ],
          providerMetadata: {
            continuationId: "call-2",
          },
        },
      ],
    });
    const { node } = createNode({
      interruptResponse: "opt-1",
    });
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Create a launch plan",
        outputSchema: PlanSchema,
        interrupt: {
          requestSchema: ChoiceRequestSchema,
          responseSchema: ChoiceResponseSchema,
        },
      }),
    );

    expect(result.usage).toEqual({
      input: 22,
      output: 14,
      total: 36,
    });
    expect(result.finishReason).toEqual({
      unified: "stop",
      raw: "STOP",
    });
    expect(result.providerMetadata).toEqual({
      firstPassId: "call-1",
      continuationId: "call-2",
    });
    expect(result.warnings).toEqual([
      {
        type: "other",
        message: "first-pass warning",
      },
      {
        type: "other",
        message: "continuation warning",
      },
    ]);
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

    const runtime = {
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

    const { invoke, modelRef } = createProvider({
      invokeResponses: [second],
    });
    const { node, emitted, interrupts } = createNode({
      interruptResponse: "accepted",
    });
    const state = createState(runtime);

    const { result, runtimeUpdates } = await runWithHookContext(
      { node, state },
      async () =>
        useReason({
          id: "reason-id",
          model: modelRef,
          input: "Create a launch plan",
          outputSchema: PlanSchema,
          structured: {
            dataType: "reason.plan",
            stream: true,
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
      runtimeUpdates as {
        __kortyx?: {
          nodeState?: { state?: { byKey?: Record<string, unknown> } };
        };
      }
    ).__kortyx?.nodeState?.state?.byKey;
    expect(nextByKey).toBeDefined();
    expect(Object.hasOwn(nextByKey ?? {}, "__useReason:reason-id")).toBe(false);
  });

  it("reuses a completed earlier useReason result when a later useReason interrupts in the same node", async () => {
    const firstReasonFirstPass = JSON.stringify({
      output: {
        summary: "First draft",
        recommendation: "First draft recommendation",
        checklist: ["first"],
        userChoice: "pending",
      },
      draftText: "First draft",
      interruptRequest: {
        kind: "choice",
        question: "Pick first",
        options: [{ id: "first", label: "First" }],
      },
    });
    const firstReasonFinal = JSON.stringify({
      summary: "First final",
      recommendation: "First final recommendation",
      checklist: ["first"],
      userChoice: "first",
    });
    const secondReasonFirstPass = JSON.stringify({
      output: {
        summary: "Second draft",
        recommendation: "Second draft recommendation",
        checklist: ["second"],
        userChoice: "pending",
      },
      draftText: "Second draft",
      interruptRequest: {
        kind: "choice",
        question: "Pick second",
        options: [{ id: "second", label: "Second" }],
      },
    });
    const secondReasonFinal = JSON.stringify({
      summary: "Second final",
      recommendation: "Second final recommendation",
      checklist: ["second"],
      userChoice: "second",
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [
        firstReasonFirstPass,
        firstReasonFinal,
        secondReasonFirstPass,
        secondReasonFinal,
      ],
    });

    const runTwoReasons = async () => {
      const first = await useReason({
        id: "first-reason",
        model: modelRef,
        input: "Create first plan",
        outputSchema: PlanSchema,
        interrupt: {
          requestSchema: ChoiceRequestSchema,
          responseSchema: ChoiceResponseSchema,
        },
      });

      const second = await useReason({
        id: "second-reason",
        model: modelRef,
        input: "Create second plan",
        outputSchema: PlanSchema,
        interrupt: {
          requestSchema: ChoiceRequestSchema,
          responseSchema: ChoiceResponseSchema,
        },
      });

      return { first, second };
    };

    const paused = new Error("pause for second interrupt");
    let interruptCount = 0;
    const firstNode = createNode({
      onInterrupt: () => {
        interruptCount += 1;
        if (interruptCount === 1) return "first";
        throw paused;
      },
    });
    const firstState = createState();

    await expect(
      runWithHookContext(
        { node: firstNode.node, state: firstState },
        runTwoReasons,
      ),
    ).rejects.toThrow("pause for second interrupt");

    const runtimePatch = (
      paused as Error & { __kortyxHookStatePatch?: Record<string, unknown> }
    ).__kortyxHookStatePatch;

    expect(runtimePatch).toBeTruthy();
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(firstNode.interrupts).toHaveLength(2);

    const secondNode = createNode({
      interruptResponse: "second",
    });
    const secondState = createState(runtimePatch);

    const { result, runtimeUpdates } = await runWithHookContext(
      { node: secondNode.node, state: secondState },
      runTwoReasons,
    );

    expect(invoke).toHaveBeenCalledTimes(4);
    expect(secondNode.interrupts).toHaveLength(1);
    expect(result.first.output?.userChoice).toBe("first");
    expect(result.second.output?.userChoice).toBe("second");

    const nextByKey = (
      runtimeUpdates as {
        __kortyx?: {
          nodeState?: { state?: { byKey?: Record<string, unknown> } };
        };
      }
    ).__kortyx?.nodeState?.state?.byKey;
    expect(nextByKey).toBeDefined();
    expect(Object.hasOwn(nextByKey ?? {}, "__useReason:first-reason")).toBe(
      false,
    );
    expect(Object.hasOwn(nextByKey ?? {}, "__useReason:second-reason")).toBe(
      false,
    );
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

    const { invoke, modelRef } = createProvider({
      invokeResponses: [badFirst],
    });
    const { node, interrupts } = createNode({
      interruptResponse: "opt-1",
    });
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          id: "reason-id",
          model: modelRef,
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

  it("throws a truncation-specific error when interrupt first-pass structured output is cut off by output length", async () => {
    const { invoke, modelRef } = createProvider({
      invokeResponses: [
        {
          content: '{"output":{"summary":"Draft summary"',
          finishReason: {
            unified: "length",
            raw: "MAX_TOKENS",
          },
        },
      ],
    });
    const { node, interrupts } = createNode({
      interruptResponse: "opt-1",
    });
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create a launch plan",
          outputSchema: PlanSchema,
          interrupt: {
            requestSchema: ChoiceRequestSchema,
            responseSchema: ChoiceResponseSchema,
          },
        }),
      ),
    ).rejects.toThrow(
      "useReason output was truncated before producing valid structured output. The model stopped due to output length. Increase maxOutputTokens or simplify the requested output.",
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(0);
  });

  it("throws a truncation-specific error when interrupt first-pass JSON is cut off without finishReason metadata", async () => {
    const { invoke, modelRef } = createProvider({
      invokeResponses: [
        {
          content:
            '{"output":{"summary":"Draft summary","recommendation":"Draft recommendation"',
        },
      ],
    });
    const { node, interrupts } = createNode({
      interruptResponse: "opt-1",
    });
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create a launch plan",
          outputSchema: PlanSchema,
          interrupt: {
            requestSchema: ChoiceRequestSchema,
            responseSchema: ChoiceResponseSchema,
          },
        }),
      ),
    ).rejects.toThrow(
      "useReason output was truncated before producing valid structured output.",
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(0);
  });

  it("fails fast when includeThoughts is enabled for interrupt flows", async () => {
    const { invoke, provider } = createProvider({
      invokeResponses: [
        JSON.stringify({
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
        }),
      ],
    });
    const modelRef = provider("mock-model", {
      reasoning: {
        includeThoughts: true,
      },
    });
    const { node, interrupts } = createNode({
      interruptResponse: "opt-1",
    });
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create a launch plan",
          outputSchema: PlanSchema,
          interrupt: {
            requestSchema: ChoiceRequestSchema,
            responseSchema: ChoiceResponseSchema,
          },
        }),
      ),
    ).rejects.toThrow(
      "useReason does not support reasoning.includeThoughts with structured output, interrupt mode, or JSON responseFormat. Disable includeThoughts for this call.",
    );

    expect(invoke).not.toHaveBeenCalled();
    expect(interrupts).toHaveLength(0);
  });
});
