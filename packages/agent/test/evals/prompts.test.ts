// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks execute in server workflow nodes.

import { defineWorkflow } from "@kortyx/core";
import { usePrompt, useReason } from "@kortyx/hooks";
import {
  createPrompts,
  definePrompt,
  type PromptContent,
  type PromptSnapshot,
  promptHash,
} from "@kortyx/prompts";
import type { ProviderModelRef } from "@kortyx/providers";
import { createInMemoryFrameworkAdapter } from "@kortyx/runtime";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAgent } from "../../src/chat/create-agent";
import { createEvals } from "../../src/evals/create-evals";
import { promptEvaluationContext } from "../../src/evals/prompt-context";

describe("prompt eval execution", () => {
  it("calls the real model adapter with both roles and reports the candidate actually used", async () => {
    const received: unknown[] = [];
    const model: ProviderModelRef = {
      modelId: "deterministic",
      provider: {
        id: "deterministic",
        models: ["deterministic"],
        getModel: () => ({
          invoke: async (messages) => {
            received.push(messages);
            return { content: "support" };
          },
          stream: async function* () {},
        }),
      },
    };
    const reference = definePrompt({
      id: "classify",
      format: "system-user",
      variables: z.object({ message: z.string() }),
      config: z.object({ modelName: z.literal("fast") }),
    });
    const content: PromptContent = {
      format: "system-user",
      messages: [
        { role: "system", content: "Classify exactly" },
        { role: "user", content: "{{message}}" },
      ],
      variablesSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
      configSchema: {
        type: "object",
        properties: { modelName: { const: "fast" } },
        required: ["modelName"],
      },
      config: { modelName: "fast" },
      dependencies: [],
    };
    const baseline: PromptSnapshot = {
      schemaVersion: 1,
      environment: "production",
      revision: "baseline",
      versions: {
        classify: {
          id: "classify",
          version: 1,
          hash: await promptHash(content),
          content,
        },
      },
      source: "local",
      resolvedAt: new Date().toISOString(),
    };
    const included: PromptContent = {
      ...content,
      config: { modelName: "fast" },
      messages: [
        { role: "system", content: "Candidate instructions" },
        content.messages[1]!,
      ],
    };
    const includedHash = await promptHash(included);
    const candidate = {
      ...content,
      messages: [
        { role: "system" as const, content: "[[prompt:shared/instructions]]" },
        { role: "user" as const, content: "{{message}}" },
      ],
    };
    candidate.dependencies = [
      { id: "shared/instructions", version: 9, hash: includedHash },
    ];
    const evaluation: PromptSnapshot = {
      ...baseline,
      source: "eval",
      revision: "candidate",
      versions: {
        classify: {
          id: "classify",
          version: 2,
          hash: await promptHash(candidate),
          content: candidate,
        },
        "shared/instructions": {
          id: "shared/instructions",
          version: 9,
          hash: includedHash,
          content: included,
        },
      },
    };
    let live = baseline;
    const agent = createAgent({
      frameworkAdapter: createInMemoryFrameworkAdapter(),
      prompts: createPrompts({
        definitions: [reference],
        source: {
          identity: "fixture",
          environment: "production",
          resolve: async () => live,
        },
      }),
      defaultWorkflowId: "classify",
      workflows: [
        defineWorkflow({
          id: "classify",
          version: "1",
          inputSchema: z.string(),
          outputSchema: z.object({ label: z.string() }),
          nodes: {
            answer: {
              run: async ({ input }: { input: string }) => {
                const prompt = await usePrompt(reference, {
                  variables: { message: input },
                });
                const response = await useReason({
                  prompt,
                  model,
                  stream: false,
                });
                return {
                  data: { label: response.text },
                  ui: { message: response.text },
                };
              },
            },
          },
          edges: [
            ["__start__", "answer"],
            ["answer", "__end__"],
          ],
        }),
      ],
    });
    const evals = createEvals({
      agent,
      suites: [
        {
          id: "smoke",
          cases: [
            {
              id: "support",
              steps: [{ message: "Help", expect: { type: "answer" } }],
            },
          ],
        },
      ],
    });
    expect(evals.describe().promptContracts?.[0]?.id).toBe("classify");
    await expect(
      promptEvaluationContext.run(
        { snapshot: evaluation, onUsage: () => {} },
        () =>
          createAgent({ workflows: [] }).streamChat([
            { role: "user", content: "Help" },
          ]),
      ),
    ).rejects.toThrow("no prompt manager");
    const result = await evals.run({
      suiteId: "smoke",
      promptSnapshot: evaluation,
    });
    expect(result.status).toBe("passed");
    expect(received).toEqual([
      [
        { role: "system", content: "Candidate instructions" },
        { role: "user", content: "Help" },
      ],
    ]);
    expect(result.cases[0]?.steps[0]?.observation.promptUsage).toEqual([
      expect.objectContaining({
        id: "classify",
        version: 2,
        hash: evaluation.versions.classify?.hash,
      }),
      expect.objectContaining({
        id: "shared/instructions",
        version: 9,
        hash: includedHash,
      }),
    ]);
    const baselineRun = await evals.run({ suiteId: "smoke" });
    expect(baselineRun.status).toBe("passed");
    expect(received[1]).toEqual([
      { role: "system", content: "Classify exactly" },
      { role: "user", content: "Help" },
    ]);
    expect(
      await agent.execute({ workflow: "classify", input: "Help" }),
    ).toMatchObject({ status: "completed" });
    expect(received[2]).toEqual([
      { role: "system", content: "Classify exactly" },
      { role: "user", content: "Help" },
    ]);
    const chunks = [];
    for await (const chunk of await agent.streamChat(
      [{ role: "user", content: "Checkpoint" }],
      { sessionId: "prompt-checkpoint" },
    ))
      chunks.push(chunk);
    expect(JSON.stringify(chunks)).not.toContain("__promptSnapshot");
    expect(JSON.stringify(chunks)).not.toContain("Classify exactly");
    const checkpoint = chunks.find((chunk) => chunk.type === "checkpoint");
    if (!checkpoint || checkpoint.type !== "checkpoint")
      throw new Error("Missing checkpoint");
    expect(JSON.stringify(await agent.getCheckpoint(checkpoint.id))).toContain(
      "__promptSnapshot",
    );
    live = { ...evaluation, source: "studio" };
    const fork = await agent.fork(checkpoint.id, {
      newSessionId: "prompt-checkpoint-fork",
    });
    for await (const _ of await agent.streamChat(
      [{ role: "user", content: "Fork input" }],
      { sessionId: fork.sessionId },
    )) {
      /* consume the public stream */
    }
    expect(received.at(-1)).toEqual([
      { role: "system", content: "Classify exactly" },
      { role: "user", content: "Fork input" },
    ]);
  });
});
