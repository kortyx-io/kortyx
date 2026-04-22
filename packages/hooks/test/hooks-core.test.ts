import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runWithHookContext } from "../src/context";
import { useInterrupt, useStructuredData } from "../src/hooks";
import { createNode, createState } from "./helpers";

const ChoiceRequestSchema = z.object({
  kind: z.literal("choice"),
  question: z.string().min(1),
  options: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
      }),
    )
    .min(1),
});

const ChoiceResponseSchema = z.string().min(1);

describe("hooks core APIs", () => {
  it("useStructuredData validates and emits structured_data", async () => {
    const { node, emitted } = createNode();
    const state = createState();
    const payloadSchema = z.object({
      step: z.string().min(1),
    });

    await runWithHookContext({ node, state }, async () => {
      useStructuredData({
        id: "reason-1",
        streamId: "stream-1",
        dataType: "demo.lifecycle",
        schemaId: "demo-schema",
        schemaVersion: "1",
        dataSchema: payloadSchema,
        data: { step: "start" },
      });
      return null;
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe("structured_data");
    expect(emitted[0].payload).toMatchObject({
      node: "reason",
      id: "reason-1",
      streamId: "stream-1",
      dataType: "demo.lifecycle",
      kind: "final",
      schemaId: "demo-schema",
      schemaVersion: "1",
      data: { step: "start" },
    });
  });

  it("useStructuredData allows dotted paths for manual updates", async () => {
    const { node, emitted } = createNode();
    const state = createState();

    await runWithHookContext({ node, state }, async () => {
      useStructuredData({
        streamId: "stream-1",
        dataType: "demo.draft",
        kind: "text-delta",
        path: "draft.body",
        delta: "Hello",
      });
      return null;
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.payload).toMatchObject({
      streamId: "stream-1",
      dataType: "demo.draft",
      kind: "text-delta",
      path: "draft.body",
      delta: "Hello",
    });
  });

  it("useStructuredData throws on invalid path syntax", async () => {
    const { node } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () => {
        useStructuredData({
          kind: "set",
          path: "draft..body",
          value: "Hello",
        });
        return null;
      }),
    ).rejects.toThrow(
      'useStructuredData path "draft..body" must not contain empty segments.',
    );
  });

  it("useStructuredData throws on schema validation failure", async () => {
    const { node } = createNode();
    const state = createState();
    const payloadSchema = z.object({
      step: z.string().min(1),
    });

    await expect(
      runWithHookContext({ node, state }, async () => {
        useStructuredData({
          dataSchema: payloadSchema,
          data: { step: 123 as unknown as string },
        });
        return null;
      }),
    ).rejects.toThrow("useStructuredData data validation failed");
  });

  it("useInterrupt forwards schema/id/meta and validates response", async () => {
    const { node, interrupts } = createNode({ interruptResponse: "opt-1" });
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useInterrupt({
        id: "reason-1",
        schemaId: "reason-choice",
        schemaVersion: "1",
        meta: { feature: "reason-demo" },
        requestSchema: ChoiceRequestSchema,
        responseSchema: ChoiceResponseSchema,
        request: {
          kind: "choice",
          question: "Pick one",
          options: [{ id: "opt-1", label: "Option 1" }],
        },
      }),
    );

    expect(result).toBe("opt-1");
    expect(interrupts).toHaveLength(1);
    expect(interrupts[0]).toMatchObject({
      kind: "choice",
      question: "Pick one",
      id: "reason-1",
      schemaId: "reason-choice",
      schemaVersion: "1",
      meta: { feature: "reason-demo" },
    });
  });

  it("useInterrupt throws when response fails schema", async () => {
    const { node } = createNode({ interruptResponse: "" });
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useInterrupt({
          requestSchema: ChoiceRequestSchema,
          responseSchema: ChoiceResponseSchema,
          request: {
            kind: "choice",
            question: "Pick one",
            options: [{ id: "opt-1", label: "Option 1" }],
          },
        }),
      ),
    ).rejects.toThrow("useInterrupt response validation failed");
  });
});
