import type { MemoryAdapter } from "@kortyx/memory";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runWithHookContext } from "../src/context";
import {
  useAiMemory,
  useEmit,
  useInterrupt,
  useStructuredData,
} from "../src/hooks";
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
  it("useEmit proxies node emit", async () => {
    const { node, emitted } = createNode();
    const state = createState();

    await runWithHookContext({ node, state }, async () => {
      const emit = useEmit();
      emit("status", { message: "ok" });
      return null;
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({
      event: "status",
      payload: { message: "ok" },
    });
  });

  it("useStructuredData validates and emits structured_data", async () => {
    const { node, emitted } = createNode();
    const state = createState();
    const payloadSchema = z.object({
      step: z.string().min(1),
    });

    await runWithHookContext({ node, state }, async () => {
      useStructuredData({
        id: "reason-1",
        opId: "op-1",
        dataType: "demo.lifecycle",
        mode: "snapshot",
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
      opId: "op-1",
      dataType: "demo.lifecycle",
      mode: "snapshot",
      schemaId: "demo-schema",
      schemaVersion: "1",
      data: { step: "start" },
    });
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
          data: { step: 123 },
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

  it("useAiMemory returns configured adapter", async () => {
    const { node } = createNode();
    const state = createState();
    const memoryAdapter: MemoryAdapter = {
      save: vi.fn(async () => {}),
      load: vi.fn(async () => null),
      delete: vi.fn(async () => {}),
    };

    const { result } = await runWithHookContext(
      { node, state, memoryAdapter },
      async () => useAiMemory(),
    );

    expect(result).toBe(memoryAdapter);
  });

  it("useAiMemory throws when adapter is missing", async () => {
    const { node } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () => useAiMemory()),
    ).rejects.toThrow(
      "useAiMemory requires a memory adapter in runtime config.",
    );
  });
});
