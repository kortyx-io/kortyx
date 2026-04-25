import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runWithHookContext } from "../src/context";
import { useReason } from "../src/hooks";
import type { ReasonTraceAdapter, ReasonTraceSpan } from "../src/tracing";
import { createNode, createProvider, createState } from "./helpers";

const PlanSchema = z.object({
  summary: z.string(),
  recommendation: z.string(),
  checklist: z.array(z.string()),
  userChoice: z.string(),
});

const JobsSchema = z.object({
  summary: z.string(),
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
    }),
  ),
});

const EmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

const MultiTextSchema = z.object({
  intro: z.string(),
  body: z.string(),
});

const MultiAppendSchema = z.object({
  highlights: z.array(z.string()),
  ctas: z.array(z.string()),
});

describe("useReason output flow", () => {
  it("passes normalized call options through to provider model resolution", async () => {
    const abortController = new AbortController();
    const { provider, modelRef } = createProvider({
      invokeResponses: [{ content: "Summary" }],
    });
    const { node } = createNode();
    const state = createState();

    await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Create a summary",
        stream: false,
        temperature: 0.25,
        maxOutputTokens: 600,
        stopSequences: ["</final>"],
        abortSignal: abortController.signal,
        reasoning: {
          effort: "high",
          maxTokens: 128,
          includeThoughts: false,
        },
        responseFormat: {
          type: "json",
        },
        providerOptions: {
          requestTag: "reason-test",
        },
      }),
    );

    expect(provider.getModel).toHaveBeenCalledWith("mock-model", {
      temperature: 0.25,
      streaming: false,
      maxOutputTokens: 600,
      stopSequences: ["</final>"],
      abortSignal: abortController.signal,
      reasoning: {
        effort: "high",
        maxTokens: 128,
        includeThoughts: false,
      },
      responseFormat: {
        type: "json",
      },
      providerOptions: {
        requestTag: "reason-test",
      },
    });
  });

  it("uses model ref defaults when call options are omitted", async () => {
    const abortController = new AbortController();
    const { provider } = createProvider({
      invokeResponses: [{ content: "Summary" }],
    });
    const modelRef = provider("mock-model", {
      temperature: 0.15,
      streaming: false,
      maxOutputTokens: 320,
      stopSequences: ["END"],
      abortSignal: abortController.signal,
      reasoning: {
        effort: "low",
        maxTokens: 48,
      },
      responseFormat: {
        type: "text",
      },
      providerOptions: {
        requestTag: "model-default",
      },
    });
    const { node } = createNode();
    const state = createState();

    await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Create a summary",
      }),
    );

    expect(provider.getModel).toHaveBeenCalledWith("mock-model", {
      temperature: 0.15,
      streaming: false,
      maxOutputTokens: 320,
      stopSequences: ["END"],
      abortSignal: abortController.signal,
      reasoning: {
        effort: "low",
        maxTokens: 48,
      },
      responseFormat: {
        type: "text",
      },
      providerOptions: {
        requestTag: "model-default",
      },
    });
  });

  it("lets call options override model ref defaults", async () => {
    const modelAbortController = new AbortController();
    const callAbortController = new AbortController();
    const { provider } = createProvider({
      streamResponses: ["hello ", "world"],
    });
    const modelRef = provider("mock-model", {
      temperature: 0.15,
      streaming: false,
      maxOutputTokens: 320,
      stopSequences: ["END"],
      abortSignal: modelAbortController.signal,
      reasoning: {
        effort: "low",
        maxTokens: 48,
      },
      responseFormat: {
        type: "text",
      },
      providerOptions: {
        requestTag: "model-default",
      },
    });
    const { node } = createNode();
    const state = createState();

    await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Create a summary",
        stream: true,
        temperature: 0.65,
        maxOutputTokens: 900,
        stopSequences: ["STOP"],
        abortSignal: callAbortController.signal,
        reasoning: {
          effort: "medium",
          maxTokens: 96,
          includeThoughts: false,
        },
        responseFormat: {
          type: "json",
        },
        providerOptions: {
          requestTag: "call-override",
        },
      }),
    );

    expect(provider.getModel).toHaveBeenCalledWith("mock-model", {
      temperature: 0.65,
      streaming: true,
      maxOutputTokens: 900,
      stopSequences: ["STOP"],
      abortSignal: callAbortController.signal,
      reasoning: {
        effort: "medium",
        maxTokens: 96,
        includeThoughts: false,
      },
      responseFormat: {
        type: "json",
      },
      providerOptions: {
        requestTag: "call-override",
      },
    });
  });

  it("returns normalized provider metadata for direct invoke calls", async () => {
    const { modelRef } = createProvider({
      invokeResponses: [
        {
          content: "Summary",
          usage: {
            input: 11,
            output: 7,
            total: 18,
          },
          finishReason: {
            unified: "stop",
            raw: "STOP",
          },
          providerMetadata: {
            providerId: "mock",
            requestId: "req-123",
          },
          warnings: [
            {
              type: "compatibility",
              feature: "responseFormat.schema",
              details: "Schema was ignored.",
            },
          ],
        },
      ],
    });
    const { node } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Create a summary",
        stream: false,
      }),
    );

    expect(result.text).toBe("Summary");
    expect(result.usage).toEqual({
      input: 11,
      output: 7,
      total: 18,
    });
    expect(result.finishReason).toEqual({
      unified: "stop",
      raw: "STOP",
    });
    expect(result.providerMetadata).toEqual({
      providerId: "mock",
      requestId: "req-123",
    });
    expect(result.warnings).toEqual([
      {
        type: "compatibility",
        feature: "responseFormat.schema",
        details: "Schema was ignored.",
      },
    ]);
  });

  it("uses stream mode without emitting text events when emit is false", async () => {
    const { stream, invoke, modelRef } = createProvider({
      streamResponses: ["hello ", "world"],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Say hello",
        stream: true,
        emit: false,
      }),
    );

    expect(result.text).toBe("hello world");
    expect(stream).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(0);
    expect(emitted).toHaveLength(0);
  });

  it("uses invoke mode without emitting text events when stream and emit are false", async () => {
    const { stream, invoke, modelRef } = createProvider({
      invokeResponses: [{ content: "Summary" }],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Create a summary",
        stream: false,
        emit: false,
      }),
    );

    expect(result.text).toBe("Summary");
    expect(stream).toHaveBeenCalledTimes(0);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveLength(0);
  });

  it("returns normalized finish metadata from streaming provider responses", async () => {
    const { modelRef } = createProvider({
      streamResponses: [
        "hello ",
        "world",
        {
          type: "finish",
          usage: {
            input: 12,
            output: 8,
            total: 20,
          },
          finishReason: {
            unified: "stop",
            raw: "STOP",
          },
          providerMetadata: {
            requestId: "stream-123",
          },
          warnings: [
            {
              type: "unsupported",
              feature: "providerOptions",
              details: "Ignored by mock provider.",
            },
          ],
        },
      ],
    });
    const { node } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Say hello",
        stream: true,
      }),
    );

    expect(result.text).toBe("hello world");
    expect(result.usage).toEqual({
      input: 12,
      output: 8,
      total: 20,
    });
    expect(result.finishReason).toEqual({
      unified: "stop",
      raw: "STOP",
    });
    expect(result.providerMetadata).toEqual({
      requestId: "stream-123",
    });
    expect(result.warnings).toEqual([
      {
        type: "unsupported",
        feature: "providerOptions",
        details: "Ignored by mock provider.",
      },
    ]);
  });

  it("accumulates provider usage into runtime token usage updates", async () => {
    const { modelRef } = createProvider({
      invokeResponses: [
        {
          content: "Summary",
          usage: {
            input: 9,
            output: 5,
            total: 14,
          },
        },
      ],
    });
    const { node } = createNode();
    const state = createState({
      tokenUsage: {
        input: 3,
        output: 2,
        total: 5,
      },
    });

    const { runtimeUpdates } = await runWithHookContext(
      { node, state },
      async () =>
        useReason({
          model: modelRef,
          input: "Create a summary",
          stream: false,
        }),
    );

    expect(runtimeUpdates).toMatchObject({
      tokenUsage: {
        input: 12,
        output: 7,
        total: 19,
      },
    });
  });

  it("emits trace spans for useReason and runReasonEngine", async () => {
    const { modelRef } = createProvider({
      invokeResponses: [
        {
          content: "Summary",
          usage: {
            input: 4,
            output: 6,
            total: 10,
          },
          finishReason: {
            unified: "stop",
            raw: "STOP",
          },
        },
      ],
    });
    const { node } = createNode();
    const state = createState();
    const startSpan = vi.fn(
      ({
        name,
      }: {
        name: "useReason" | "runReasonEngine";
      }): ReasonTraceSpan => ({
        end: vi.fn(),
        addEvent: vi.fn(),
        fail: vi.fn(),
        setAttributes: vi.fn(),
      }),
    );
    const reasonTrace: ReasonTraceAdapter = {
      startSpan,
    };

    await runWithHookContext({ node, state, reasonTrace }, async () =>
      useReason({
        model: modelRef,
        input: "Create a summary",
        stream: false,
      }),
    );

    expect(startSpan).toHaveBeenCalledTimes(2);
    expect(startSpan.mock.calls[0]?.[0]).toMatchObject({
      name: "useReason",
      attributes: expect.objectContaining({
        providerId: "mock",
        modelId: "mock-model",
      }),
    });
    expect(startSpan.mock.calls[1]?.[0]).toMatchObject({
      name: "runReasonEngine",
      attributes: expect.objectContaining({
        providerId: "mock",
        modelId: "mock-model",
      }),
    });
  });

  it("parses JSON output and emits one structured patch", async () => {
    const response = JSON.stringify({
      summary: "Summary",
      recommendation: "Recommendation",
      checklist: ["item-1"],
      userChoice: "pending",
    });
    const { invoke, modelRef } = createProvider({
      invokeResponses: [response],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        id: "reason-id",
        model: modelRef,
        input: "Create a plan",
        stream: false,
        emit: true,
        outputSchema: PlanSchema,
        structured: {
          dataType: "reason.plan",
          stream: true,
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

  it("returns structured output without emitting structured patches when emit is false", async () => {
    const response = JSON.stringify({
      summary: "Summary",
      recommendation: "Recommendation",
      checklist: ["item-1"],
      userChoice: "pending",
    });
    const { invoke, modelRef } = createProvider({
      invokeResponses: [response],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        id: "reason-id",
        model: modelRef,
        input: "Create a plan",
        stream: false,
        emit: false,
        outputSchema: PlanSchema,
        structured: {
          dataType: "reason.plan",
          stream: true,
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
    expect(emitted).toHaveLength(0);
  });

  it("does not emit incremental structured patches when emit is false", async () => {
    const response = JSON.stringify({
      subject: "Launch update",
      body: "Longer launch body",
    });
    const { invoke, stream, modelRef } = createProvider({
      invokeResponses: [response],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Create a launch email",
        stream: true,
        emit: false,
        outputSchema: EmailSchema,
        structured: {
          dataType: "reason.email",
          stream: true,
          fields: {
            body: "text-delta",
          },
        },
      }),
    );

    expect(result.output).toEqual({
      subject: "Launch update",
      body: "Longer launch body",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(stream).toHaveBeenCalledTimes(0);
    expect(emitted).toHaveLength(0);
  });

  it("fails fast when includeThoughts is used with structured JSON output", async () => {
    const { invoke, modelRef } = createProvider({
      invokeResponses: [
        JSON.stringify({
          summary: "Summary",
          recommendation: "Recommendation",
          checklist: ["item-1"],
          userChoice: "pending",
        }),
      ],
    });
    const { node, emitted } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create a plan",
          outputSchema: PlanSchema,
          structured: {
            dataType: "reason.plan",
            stream: true,
          },
          responseFormat: {
            type: "json",
          },
          reasoning: {
            includeThoughts: true,
          },
        }),
      ),
    ).rejects.toThrow(
      "useReason does not support reasoning.includeThoughts with structured output, interrupt mode, or JSON responseFormat. Disable includeThoughts for this call.",
    );

    expect(invoke).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
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

    const { modelRef } = createProvider({
      invokeResponses: [response],
    });
    const { node } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Create a plan",
        stream: false,
        emit: true,
        outputSchema: PlanSchema,
      }),
    );

    expect(result.output?.summary).toBe("Summary");
  });

  it("streams append updates for one declared array field before final output", async () => {
    const { stream, invoke, modelRef } = createProvider({
      streamResponses: [
        '{"summary":"Jobs","jobs":[',
        '{"id":"job-1","title":"First role"}',
        ",",
        '{"id":"job-2","title":"Second role"}',
        "]}",
      ],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        id: "jobs-reason",
        model: modelRef,
        input: "Create jobs",
        stream: true,
        emit: true,
        outputSchema: JobsSchema,
        structured: {
          dataType: "reason.jobs",
          stream: true,
          fields: {
            jobs: "append",
          },
        },
      }),
    );

    expect(stream).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(0);
    expect(result.output).toEqual({
      summary: "Jobs",
      jobs: [
        { id: "job-1", title: "First role" },
        { id: "job-2", title: "Second role" },
      ],
    });

    const structuredEvents = emitted.filter(
      (x) => x.event === "structured_data",
    );
    expect(structuredEvents).toHaveLength(3);
    expect(structuredEvents[0]?.payload).toMatchObject({
      kind: "append",
      path: "jobs",
      items: [{ id: "job-1", title: "First role" }],
    });
    expect(structuredEvents[1]?.payload).toMatchObject({
      kind: "append",
      path: "jobs",
      items: [{ id: "job-2", title: "Second role" }],
    });
    expect(structuredEvents[2]?.payload).toMatchObject({
      kind: "final",
      data: {
        summary: "Jobs",
        jobs: [
          { id: "job-1", title: "First role" },
          { id: "job-2", title: "Second role" },
        ],
      },
    });

    const textEvents = emitted.filter((x) => x.event.startsWith("text-"));
    expect(textEvents).toHaveLength(0);
  });

  it("streams text-delta updates for one declared string field before final output", async () => {
    const { stream, invoke, modelRef } = createProvider({
      streamResponses: [
        '{"subject":"Welcome","body":"Hello',
        " Mustafa",
        '!\\nHow are you?"}',
      ],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        id: "email-reason",
        model: modelRef,
        input: "Create an email",
        stream: true,
        emit: true,
        outputSchema: EmailSchema,
        structured: {
          dataType: "reason.email",
          stream: true,
          fields: {
            body: "text-delta",
          },
        },
      }),
    );

    expect(stream).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(0);
    expect(result.output).toEqual({
      subject: "Welcome",
      body: "Hello Mustafa!\nHow are you?",
    });

    const structuredEvents = emitted.filter(
      (x) => x.event === "structured_data",
    );
    expect(structuredEvents).toHaveLength(4);
    expect(structuredEvents[0]?.payload).toMatchObject({
      kind: "text-delta",
      path: "body",
      delta: "Hello",
    });
    expect(structuredEvents[1]?.payload).toMatchObject({
      kind: "text-delta",
      path: "body",
      delta: " Mustafa",
    });
    expect(structuredEvents[2]?.payload).toMatchObject({
      kind: "text-delta",
      path: "body",
      delta: "!\nHow are you?",
    });
    expect(structuredEvents[3]?.payload).toMatchObject({
      kind: "final",
      data: {
        subject: "Welcome",
        body: "Hello Mustafa!\nHow are you?",
      },
    });

    const textEvents = emitted.filter((x) => x.event.startsWith("text-"));
    expect(textEvents).toHaveLength(0);
  });

  it("streams set updates for declared top-level fields before final output", async () => {
    const { stream, invoke, modelRef } = createProvider({
      streamResponses: [
        '{"subject":"Exclusive Beta Access"',
        ',"body":"Hello there"}',
      ],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        id: "email-reason",
        model: modelRef,
        input: "Create an email",
        stream: true,
        emit: true,
        outputSchema: EmailSchema,
        structured: {
          dataType: "reason.email",
          stream: true,
          fields: {
            subject: "set",
            body: "text-delta",
          },
        },
      }),
    );

    expect(stream).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(0);
    expect(result.output).toEqual({
      subject: "Exclusive Beta Access",
      body: "Hello there",
    });

    const structuredEvents = emitted.filter(
      (x) => x.event === "structured_data",
    );
    expect(structuredEvents).toHaveLength(3);
    expect(structuredEvents[0]?.payload).toMatchObject({
      kind: "set",
      path: "subject",
      value: "Exclusive Beta Access",
    });
    expect(structuredEvents[1]?.payload).toMatchObject({
      kind: "text-delta",
      path: "body",
      delta: "Hello there",
    });
    expect(structuredEvents[2]?.payload).toMatchObject({
      kind: "final",
      data: {
        subject: "Exclusive Beta Access",
        body: "Hello there",
      },
    });

    const textEvents = emitted.filter((x) => x.event.startsWith("text-"));
    expect(textEvents).toHaveLength(0);
  });

  it("streams text-delta updates for multiple declared string fields", async () => {
    const { stream, invoke, modelRef } = createProvider({
      streamResponses: [
        '{"intro":"Hello',
        ' world","body":"Line one',
        ' and line two"}',
      ],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        id: "multi-text-reason",
        model: modelRef,
        input: "Create an email",
        stream: true,
        emit: true,
        outputSchema: MultiTextSchema,
        structured: {
          dataType: "reason.multi-text",
          stream: true,
          fields: {
            intro: "text-delta",
            body: "text-delta",
          },
        },
      }),
    );

    expect(stream).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(0);
    expect(result.output).toEqual({
      intro: "Hello world",
      body: "Line one and line two",
    });

    const structuredEvents = emitted.filter(
      (x) => x.event === "structured_data",
    );
    expect(structuredEvents).toHaveLength(5);
    expect(structuredEvents[0]?.payload).toMatchObject({
      kind: "text-delta",
      path: "intro",
      delta: "Hello",
    });
    expect(structuredEvents[1]?.payload).toMatchObject({
      kind: "text-delta",
      path: "intro",
      delta: " world",
    });
    expect(structuredEvents[2]?.payload).toMatchObject({
      kind: "text-delta",
      path: "body",
      delta: "Line one",
    });
    expect(structuredEvents[3]?.payload).toMatchObject({
      kind: "text-delta",
      path: "body",
      delta: " and line two",
    });
    expect(structuredEvents[4]?.payload).toMatchObject({
      kind: "final",
      data: {
        intro: "Hello world",
        body: "Line one and line two",
      },
    });
  });

  it("streams append updates for multiple declared array fields", async () => {
    const { stream, invoke, modelRef } = createProvider({
      streamResponses: [
        '{"highlights":["A"',
        ',"B"',
        '],"ctas":["C"',
        ',"D"',
        "]}",
      ],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        id: "multi-append-reason",
        model: modelRef,
        input: "Create bullet lists",
        stream: true,
        emit: true,
        outputSchema: MultiAppendSchema,
        structured: {
          dataType: "reason.multi-append",
          stream: true,
          fields: {
            highlights: "append",
            ctas: "append",
          },
        },
      }),
    );

    expect(stream).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(0);
    expect(result.output).toEqual({
      highlights: ["A", "B"],
      ctas: ["C", "D"],
    });

    const structuredEvents = emitted.filter(
      (x) => x.event === "structured_data",
    );
    expect(structuredEvents).toHaveLength(5);
    expect(
      new Set(structuredEvents.map((event) => event.payload.streamId)),
    ).toEqual(new Set([result.opId]));
    expect(structuredEvents[0]?.payload).toMatchObject({
      kind: "append",
      path: "highlights",
      items: ["A"],
    });
    expect(structuredEvents[1]?.payload).toMatchObject({
      kind: "append",
      path: "highlights",
      items: ["B"],
    });
    expect(structuredEvents[2]?.payload).toMatchObject({
      kind: "append",
      path: "ctas",
      items: ["C"],
    });
    expect(structuredEvents[3]?.payload).toMatchObject({
      kind: "append",
      path: "ctas",
      items: ["D"],
    });
    expect(structuredEvents[4]?.payload).toMatchObject({
      kind: "final",
      data: {
        highlights: ["A", "B"],
        ctas: ["C", "D"],
      },
    });
  });

  it("rejects dotted paths in useReason structured.fields", async () => {
    const { modelRef } = createProvider({
      streamResponses: ['{"draft":{"body":"Hello"}}'],
    });
    const { node } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create an email",
          stream: true,
          emit: true,
          outputSchema: z.object({
            draft: z.object({
              body: z.string(),
            }),
          }),
          structured: {
            dataType: "reason.email",
            stream: true,
            fields: {
              "draft.body": "text-delta",
            },
          },
        }),
      ),
    ).rejects.toThrow(
      "useReason structured text-delta streaming requires non-empty top-level string field keys.",
    );
  });

  it("rejects empty keys in useReason structured.fields", async () => {
    const { modelRef } = createProvider({
      streamResponses: ['{"body":"Hello"}'],
    });
    const { node } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create an email",
          stream: true,
          emit: true,
          outputSchema: EmailSchema,
          structured: {
            dataType: "reason.email",
            stream: true,
            fields: {
              "": "text-delta",
            },
          },
        }),
      ),
    ).rejects.toThrow(
      "useReason structured text-delta path must be a non-empty dot-separated string.",
    );
  });

  it("throws when parsed output does not satisfy outputSchema", async () => {
    const response = JSON.stringify({
      summary: 123,
      recommendation: "Recommendation",
      checklist: ["item-1"],
      userChoice: "pending",
    });

    const { invoke, modelRef } = createProvider({
      invokeResponses: [response],
    });
    const { node } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create a plan",
          stream: false,
          emit: true,
          outputSchema: PlanSchema,
        }),
      ),
    ).rejects.toThrow("useReason output validation failed");

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("throws a truncation-specific error when structured output is cut off by output length", async () => {
    const { invoke, modelRef } = createProvider({
      invokeResponses: [
        {
          content: '{"summary":"Summary"',
          finishReason: {
            unified: "length",
            raw: "MAX_TOKENS",
          },
        },
      ],
    });
    const { node } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create a plan",
          stream: false,
          emit: true,
          outputSchema: PlanSchema,
        }),
      ),
    ).rejects.toThrow(
      "useReason output was truncated before producing valid structured output. The model stopped due to output length. Increase maxOutputTokens or simplify the requested output.",
    );

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("throws a truncation-specific error when structured JSON is cut off even without finishReason metadata", async () => {
    const { invoke, modelRef } = createProvider({
      invokeResponses: [
        {
          content: '{"summary":"Summary","recommendation":"Recommendation"',
        },
      ],
    });
    const { node } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Create a plan",
          stream: false,
          emit: true,
          outputSchema: PlanSchema,
        }),
      ),
    ).rejects.toThrow(
      "useReason output was truncated before producing valid structured output.",
    );

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("streams plain text when no outputSchema/interrupt is provided", async () => {
    const { stream, invoke, modelRef } = createProvider({
      streamResponses: ["hello ", "world"],
    });
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
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
