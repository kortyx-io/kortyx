import {
  compilePrompt,
  definePrompt,
  type PromptContent,
} from "@kortyx/prompts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { normalizePromptReasonArgs } from "../src/reason/prompt";

const model = {
  modelId: "fixture",
  provider: {
    id: "fixture",
    models: ["fixture"],
    getModel: () => ({
      invoke: async () => ({ content: "Answer" }),
      stream: async function* () {},
    }),
  },
};
const reference = definePrompt({
  id: "conversation",
  format: "chat",
  variables: z.object({ message: z.string() }),
  config: z.object({}),
});
const content: PromptContent = {
  format: "chat",
  messages: [
    { role: "system", content: "Follow the demonstrated format." },
    { role: "user", content: "Example" },
    { role: "assistant", content: "Example response" },
    { role: "user", content: "{{message}}" },
  ],
  variablesSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
  configSchema: { type: "object" },
  config: {},
  dependencies: [],
};
const compiled = () =>
  compilePrompt(
    reference,
    { id: "conversation", version: 7, hash: "a".repeat(64), content },
    { message: "A new request" },
    {
      environment: "production",
      source: "studio",
      snapshotRevision: "snapshot-7",
    },
  );
describe("prompt reasoning boundary", () => {
  it("preserves the ordered few-shot conversation and immutable identity", () => {
    const prompt = compiled();
    const normalized = normalizePromptReasonArgs({ prompt, model });
    expect(normalized.messages).toEqual([
      ...content.messages.slice(0, 3),
      { role: "user", content: "A new request" },
    ]);
    expect(normalized.input).toBe("A new request");
    expect(normalized.telemetry?.prompt).toMatchObject({
      name: "conversation",
      version: 7,
      metadata: {
        hash: "a".repeat(64),
        environment: "production",
        snapshotRevision: "snapshot-7",
      },
    });
    expect(Object.isFrozen(prompt.messages)).toBe(true);
  });
  it("rejects serialized prompt objects and conflicting user-provided roles", () => {
    const prompt = compiled();
    expect(() =>
      normalizePromptReasonArgs({
        prompt: JSON.parse(JSON.stringify(prompt)),
        model,
      }),
    ).toThrow("compiled prompt");
    for (const override of [
      { input: "override" },
      { system: "override" },
      { messages: [] },
    ]) {
      expect(() =>
        normalizePromptReasonArgs({
          ...override,
          prompt,
          model,
        } as never),
      ).toThrow("either prompt");
    }
  });
});
