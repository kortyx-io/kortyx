import { beforeEach, describe, expect, it } from "vitest";
import {
  createProviderRegistry,
  getAvailableModels,
  getInitializedProviders,
  getProvider,
  hasProvider,
  registerProvider,
  resetProviders,
} from "../src";
import type { ProviderInstance } from "../src/types";

const createProvider = (
  id: string,
  models: readonly string[] = ["small", "large"],
): ProviderInstance => ({
  id,
  models,
  getModel(modelId) {
    return {
      async invoke() {
        return { content: `${id}:${modelId}` };
      },
      async *stream() {
        yield { type: "text-delta", delta: `${id}:${modelId}` };
        yield { type: "finish" };
      },
    };
  },
});

describe("createProviderRegistry", () => {
  it("registers, lists, resolves, and resets providers", () => {
    const registry = createProviderRegistry([createProvider("openai")]);

    expect(registry.hasProvider("openai")).toBe(true);
    expect(registry.getInitializedProviders()).toEqual(["openai"]);
    expect(registry.getAvailableModels("openai")).toEqual(["small", "large"]);
    expect(registry.getProvider("openai").id).toBe("openai");

    registry.register(createProvider("google", ["flash"]));

    expect(registry.getInitializedProviders()).toEqual(["openai", "google"]);
    expect(registry.getAvailableModels("google")).toEqual(["flash"]);

    registry.reset();

    expect(registry.hasProvider("openai")).toBe(false);
    expect(registry.getAvailableModels("openai")).toEqual([]);
    expect(() => registry.getProvider("openai")).toThrow(
      "Provider 'openai' is not registered.",
    );
  });
});

describe("default provider registry", () => {
  beforeEach(() => {
    resetProviders();
  });

  it("exposes the shared registry helpers", () => {
    registerProvider(createProvider("test", ["alpha"]));

    expect(hasProvider("test")).toBe(true);
    expect(getInitializedProviders()).toEqual(["test"]);
    expect(getAvailableModels("test")).toEqual(["alpha"]);
    expect(getProvider("test").models).toEqual(["alpha"]);

    resetProviders();

    expect(hasProvider("test")).toBe(false);
  });
});
