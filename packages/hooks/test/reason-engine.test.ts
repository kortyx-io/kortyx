import { describe, expect, it, vi } from "vitest";
import { runReasonEngine } from "../src/internal";
import { createProvider } from "./helpers";

describe("runReasonEngine", () => {
  it("streams text with system prompts, raw chunks, metadata, and stable event ordering", async () => {
    const { modelRef, stream } = createProvider({
      streamResponses: [
        {
          type: "text-delta",
          delta: "",
        },
        {
          type: "raw",
          raw: { event: "headers" },
          providerMetadata: {
            phase: "raw",
          },
        },
        {
          type: "text-delta",
          delta: "Hello",
          raw: { event: "delta" },
          providerMetadata: {
            phase: "delta",
          },
        },
        {
          type: "finish",
          raw: { event: "finish" },
          usage: {
            input: 2,
            output: 1,
            total: 3,
          },
          finishReason: {
            unified: "stop",
            raw: "STOP",
          },
          providerMetadata: {
            phase: "finish",
          },
          warnings: [
            {
              type: "other",
              message: "done",
            },
          ],
        },
      ],
    });
    const emitEvent = vi.fn();
    const onTextChunk = vi.fn();
    const span = {
      end: vi.fn(),
      fail: vi.fn(),
    };
    const reasonTrace = {
      startSpan: vi.fn(() => span),
    };

    const result = await runReasonEngine({
      id: "reason-id",
      opId: "op-id",
      segmentId: "segment-id",
      nodeId: "node-id",
      model: modelRef,
      system: "Follow the system prompt.",
      input: "Say hello",
      stream: true,
      emit: true,
      emitEvent,
      onTextChunk,
      reasonTrace,
    });

    expect(stream).toHaveBeenCalledWith([
      { role: "system", content: "Follow the system prompt." },
      { role: "user", content: "Say hello" },
    ]);
    expect(onTextChunk).toHaveBeenCalledTimes(1);
    expect(onTextChunk).toHaveBeenCalledWith("Hello");
    expect(emitEvent.mock.calls.map(([event]) => event)).toEqual([
      "text-start",
      "text-delta",
      "text-end",
    ]);
    expect(emitEvent.mock.calls[0]?.[1]).toMatchObject({
      id: "reason-id",
      opId: "op-id",
      segmentId: "segment-id",
      node: "node-id",
    });
    expect(result).toEqual({
      text: "Hello",
      raw: { event: "finish" },
      usage: {
        input: 2,
        output: 1,
        total: 3,
      },
      finishReason: {
        unified: "stop",
        raw: "STOP",
      },
      providerMetadata: {
        phase: "finish",
      },
      warnings: [
        {
          type: "other",
          message: "done",
        },
      ],
    });
    expect(reasonTrace.startSpan).toHaveBeenCalledWith({
      name: "runReasonEngine",
      attributes: expect.objectContaining({
        id: "reason-id",
        opId: "op-id",
        segmentId: "segment-id",
        nodeId: "node-id",
        stream: true,
        emit: true,
      }),
    });
    expect(span.end).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: {
          input: 2,
          output: 1,
          total: 3,
        },
        attributes: {
          textLength: 5,
        },
      }),
    );
    expect(span.fail).not.toHaveBeenCalled();
  });

  it("converts non-error stream failures and does not emit a text-end event", async () => {
    const { modelRef } = createProvider({
      streamResponses: [
        "partial",
        {
          type: "error",
          error: "provider string failure",
          raw: {
            provider: "raw-error",
          },
          providerMetadata: {
            requestId: "req-error",
          },
          warnings: [
            {
              type: "other",
              message: "stream aborted",
            },
          ],
        },
      ],
    });
    const emitEvent = vi.fn();
    const fail = vi.fn();
    const reasonTrace = {
      startSpan: vi.fn(() => ({
        end: vi.fn(),
        fail,
      })),
    };

    await expect(
      runReasonEngine({
        model: modelRef,
        input: "Fail",
        stream: true,
        emit: true,
        emitEvent,
        reasonTrace,
      }),
    ).rejects.toThrow("provider string failure");

    expect(emitEvent.mock.calls.map(([event]) => event)).toEqual([
      "text-start",
      "text-delta",
    ]);
    expect(fail).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        attributes: {
          providerId: "mock",
          modelId: "mock-model",
        },
      }),
    );
  });

  it("does not emit invoke text-delta events for empty invoke content", async () => {
    const { invoke, modelRef } = createProvider({
      invokeResponses: [
        {
          content: "",
        },
      ],
    });
    const emitEvent = vi.fn();

    const result = await runReasonEngine({
      model: modelRef,
      input: null as unknown as string,
      stream: false,
      emit: true,
      emitEvent,
    });

    expect(result.text).toBe("");
    expect(invoke).toHaveBeenCalledWith([{ role: "user", content: "" }]);
    expect(emitEvent.mock.calls.map(([event]) => event)).toEqual([
      "text-start",
      "text-end",
    ]);
  });

  it("allows emit mode without an event sink", async () => {
    const { modelRef } = createProvider({
      streamResponses: ["hello"],
    });

    await expect(
      runReasonEngine({
        model: modelRef,
        input: "Say hello",
        stream: true,
        emit: true,
      }),
    ).resolves.toMatchObject({
      text: "hello",
    });
  });
});
