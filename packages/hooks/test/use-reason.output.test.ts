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
