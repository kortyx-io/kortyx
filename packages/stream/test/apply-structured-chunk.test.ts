import { describe, expect, it } from "vitest";
import {
  applyStructuredChunk,
  type StructuredStreamState,
} from "../src/structured/apply-structured-chunk";
import type { StructuredDataChunk } from "../src/types/structured-data";

const baseChunk = (
  chunk: Omit<StructuredDataChunk, "type" | "streamId" | "dataType"> & {
    streamId?: string;
    dataType?: string;
  },
): StructuredDataChunk => ({
  type: "structured-data",
  streamId: chunk.streamId ?? "stream-1",
  dataType: chunk.dataType ?? "demo.data",
  ...chunk,
});

describe("applyStructuredChunk", () => {
  it("supports dotted paths for nested set updates", () => {
    const state = applyStructuredChunk(
      undefined,
      baseChunk({
        kind: "set",
        path: "draft.body",
        value: "Hello",
      }),
    );

    expect(state).toMatchObject({
      streamId: "stream-1",
      dataType: "demo.data",
      status: "streaming",
      data: {
        draft: {
          body: "Hello",
        },
      },
    });
  });

  it("replaces accumulated partial state when final arrives", () => {
    const partial = applyStructuredChunk(
      undefined,
      baseChunk({
        kind: "set",
        path: "draft.body",
        value: "Partial body",
      }),
    );

    const done = applyStructuredChunk(
      partial,
      baseChunk({
        kind: "final",
        data: {
          subject: "Final subject",
        },
      }),
    );

    expect(done).toMatchObject({
      status: "done",
      data: {
        subject: "Final subject",
      },
    });
    expect(done.data).not.toHaveProperty("draft");
  });

  it("throws on append applied to an existing non-array target", () => {
    const current: StructuredStreamState = {
      streamId: "stream-1",
      dataType: "demo.data",
      status: "streaming",
      data: {
        items: "not-an-array",
      },
    };

    expect(() =>
      applyStructuredChunk(
        current,
        baseChunk({
          kind: "append",
          path: "items",
          items: ["a"],
        }),
      ),
    ).toThrow('Structured append requires path "items" to target an array');
  });

  it("throws on text-delta applied to an existing non-string target", () => {
    const current: StructuredStreamState = {
      streamId: "stream-1",
      dataType: "demo.data",
      status: "streaming",
      data: {
        body: ["not-a-string"],
      },
    };

    expect(() =>
      applyStructuredChunk(
        current,
        baseChunk({
          kind: "text-delta",
          path: "body",
          delta: "hello",
        }),
      ),
    ).toThrow('Structured text-delta requires path "body" to target a string');
  });

  it("throws on invalid empty path", () => {
    expect(() =>
      applyStructuredChunk(
        undefined,
        baseChunk({
          kind: "set",
          path: "",
          value: "x",
        }),
      ),
    ).toThrow(
      "Structured chunk path must be a non-empty dot-separated string.",
    );
  });

  it("throws on invalid path segments", () => {
    expect(() =>
      applyStructuredChunk(
        undefined,
        baseChunk({
          kind: "set",
          path: "draft..body",
          value: "x",
        }),
      ),
    ).toThrow(
      'Structured chunk path "draft..body" must not contain empty segments.',
    );
  });

  it("throws on impossible nested path shape conflicts", () => {
    const current = applyStructuredChunk(
      undefined,
      baseChunk({
        kind: "set",
        path: "profile",
        value: "Mustafa",
      }),
    );

    expect(() =>
      applyStructuredChunk(
        current,
        baseChunk({
          kind: "set",
          path: "profile.name",
          value: "Mustafa",
        }),
      ),
    ).toThrow('Structured path conflict at profile for "profile.name"');
  });

  it("throws on conflicting chunk sequence at the same path", () => {
    const current = applyStructuredChunk(
      undefined,
      baseChunk({
        kind: "text-delta",
        path: "body",
        delta: "Hello",
      }),
    );

    expect(() =>
      applyStructuredChunk(
        current,
        baseChunk({
          kind: "append",
          path: "body",
          items: ["world"],
        }),
      ),
    ).toThrow('Structured append requires path "body" to target an array');
  });

  it("throws on chunks after final", () => {
    const current = applyStructuredChunk(
      undefined,
      baseChunk({
        kind: "final",
        data: { done: true },
      }),
    );

    expect(() =>
      applyStructuredChunk(
        current,
        baseChunk({
          kind: "set",
          path: "done",
          value: false,
        }),
      ),
    ).toThrow(
      "Structured stream stream-1 already completed with a final chunk.",
    );
  });

  it("throws on mismatched streamId", () => {
    const current: StructuredStreamState = {
      streamId: "stream-1",
      dataType: "demo.data",
      status: "streaming",
      data: {},
    };

    expect(() =>
      applyStructuredChunk(
        current,
        baseChunk({
          streamId: "stream-2",
          kind: "set",
          path: "body",
          value: "hello",
        }),
      ),
    ).toThrow(
      "Structured chunk streamId mismatch: expected stream-1, received stream-2.",
    );
  });
});
