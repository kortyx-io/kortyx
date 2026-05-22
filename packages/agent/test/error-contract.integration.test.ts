import type { WorkflowDefinition } from "@kortyx/core";
import type { StreamChunk } from "@kortyx/stream";
import { describe, expect, it, vi } from "vitest";
import { streamChat } from "../src/chat/process-chat";

const collect = async (
  stream: AsyncIterable<StreamChunk>,
): Promise<StreamChunk[]> => {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
};

describe("node error contract", () => {
  it("streams thrown node errors, stops the workflow, and skips downstream nodes", async () => {
    const downstream = vi.fn(async () => ({
      ui: { message: "should not run" },
    }));
    const workflow = {
      id: "error-flow",
      version: "1.0.0",
      nodes: {
        start: {
          run: async () => {
            throw new Error("Node exploded");
          },
        },
        downstream: {
          run: downstream,
        },
      },
      edges: [
        ["__start__", "start"],
        ["start", "downstream"],
      ],
    } satisfies WorkflowDefinition;

    const stream = await streamChat({
      messages: [{ role: "user", content: "run" }],
      defaultWorkflowId: "error-flow",
      loadRuntimeConfig: async () => ({}),
      selectWorkflow: vi.fn(async () => workflow),
      getProvider: vi.fn(),
    });

    await expect(collect(stream)).resolves.toEqual([
      { type: "error", message: "Node exploded" },
      { type: "done" },
    ]);
    expect(downstream).not.toHaveBeenCalled();
  });
});
