import { describe, expect, it } from "vitest";
import { mergeRuntimeState } from "../src/runtime-state";

describe("runtime accumulation", () => {
  it("never inspects the contents of a superseded opaque record", () => {
    const opaque = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("Opaque snapshot was traversed");
        },
      },
    );
    const current = { current: true };
    expect(
      mergeRuntimeState({ __kortyx: opaque }, { __kortyx: current }).__kortyx,
    ).toBe(current);
  });
  it("replaces owned snapshots, including removed fields, while merging application fields", () => {
    const old = {
      __kortyx: { nodeState: { snapshot: { trigger: "picker" } } },
      __kortyxParallelGraph: { request: { contract: "picker" } },
      flags: { first: true },
    };
    const next = {
      __kortyx: { nodeState: { snapshot: {} } },
      __kortyxParallelGraph: { request: { schemaId: "review" } },
      flags: { second: true },
    };
    expect(mergeRuntimeState(old, next)).toEqual({
      ...next,
      flags: { first: true, second: true },
    });
    expect(old.__kortyx.nodeState.snapshot.trigger).toBe("picker");
  });

  it("retains omitted records and accepts explicit clearing and legacy arrays", () => {
    const journal = [{ version: 1 }];
    expect(mergeRuntimeState({ __kortyxParallelGraph: journal }, {})).toEqual({
      __kortyxParallelGraph: journal,
    });
    expect(mergeRuntimeState({ __kortyx: {} }, { __kortyx: null })).toEqual({
      __kortyx: null,
    });
  });
});
