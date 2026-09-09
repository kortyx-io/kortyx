import {
  createAgent,
  createInMemoryFrameworkAdapter,
  type StreamChunk,
} from "kortyx";
import { describe, expect, it, vi } from "vitest";
import { canvasHelpWorkflow } from "./canvas-help-workflow";
import { canvasSaveWorkflow } from "./canvas-save-workflow";
import { generalChatWorkflow } from "./general-chat-workflow";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({ ids: [] as string[] }));
// Keep real workflow, node, hook, interrupt, persistence, and fork behavior.
// Only model responses are deterministic; no network or production services.
vi.mock("kortyx", async (original) => ({
  ...(await original<typeof import("kortyx")>()),
  useReason: async (args: { id: string }) => {
    calls.ids.push(args.id);
    if (args.id === "classify-intent")
      return { output: { intent: "save_canvas" }, text: "" };
    return {
      text:
        args.id === "respond-to-save" ? "Save cancelled." : "Save this canvas?",
    };
  },
}));

describe("canvas save child workflow", () => {
  it("pauses inside the child, forks confirmation, and returns data to chat", async () => {
    calls.ids = [];
    const adapter = createInMemoryFrameworkAdapter();
    const agent = createAgent({
      workflows: [generalChatWorkflow, canvasSaveWorkflow],
      defaultWorkflowId: generalChatWorkflow.id,
      frameworkAdapter: adapter,
    });
    const context = {
      tenantId: "demo",
      currentDiscoveryCanvas: {
        title: "Demo",
        intro: {
          label: "Demo",
          summary: "A discovery canvas",
          item_text: "Who needs it?",
        },
        sections: {},
      },
    };
    const collect = async (stream: Promise<AsyncIterable<StreamChunk>>) => {
      const chunks: StreamChunk[] = [];
      for await (const chunk of await stream) chunks.push(chunk);
      return chunks;
    };
    const chunks = await collect(
      agent.streamChat([{ role: "user", content: "Save the canvas" }], {
        sessionId: "canvas-source",
        context,
      }),
    );
    const interrupt = chunks.find((c) => c.type === "interrupt");
    expect(interrupt).toMatchObject({
      type: "interrupt",
      schemaId: "confirm-save",
    });
    const checkpoint = [...chunks]
      .reverse()
      .find((c) => c.type === "checkpoint");
    if (!checkpoint || !interrupt)
      throw new Error("Expected save confirmation checkpoint");
    const fork = await agent.fork(checkpoint.id, {
      newSessionId: "canvas-fork",
    });
    const pending = fork.checkpoint.activePendingRequests[0]!;
    for (const [sessionId, token, requestId] of [
      [fork.sessionId, pending.token, pending.requestId],
      ["canvas-source", interrupt.resumeToken, interrupt.requestId],
    ] as const) {
      const final = await collect(
        agent.streamChat(
          [
            {
              role: "user",
              content: "Cancel",
              metadata: { resume: { token, requestId, selected: "cancel" } },
            },
          ],
          { sessionId, context },
        ),
      );
      expect(final.filter((c) => c.type === "error")).toEqual([]);
      const done = [...final].reverse().find((c) => c.type === "done");
      expect(done).toMatchObject({
        data: {
          data: {
            intent: "save_canvas",
            responseText: "Save cancelled.",
            cancellationReason: "user-declined",
          },
        },
      });
    }
    // Child node state survives both branches: its confirmation is not restreamed.
    expect(
      calls.ids.filter((id) => id === "confirm-save-message"),
    ).toHaveLength(1);
    expect(calls.ids.filter((id) => id === "respond-to-save")).toHaveLength(2);
  });
});

describe("Canvas handoffs alongside child calls", () => {
  it("publishes the help handoff, emits help once, then starts the next turn in chat", async () => {
    calls.ids = [];
    const agent = createAgent({
      workflows: [generalChatWorkflow, canvasHelpWorkflow, canvasSaveWorkflow],
      defaultWorkflowId: generalChatWorkflow.id,
      frameworkAdapter: createInMemoryFrameworkAdapter(),
    });
    const topology = await agent.projectTopology?.({
      environment: "test",
      service: { name: "canvas" },
    });
    expect(
      topology?.find((s) => s.workflow.id === "general-chat")?.workflow
        .transitions,
    ).toEqual([{ sourceNodeId: "chat", targetWorkflowId: "canvas-help" }]);
    const chunks: StreamChunk[] = [];
    for await (const chunk of await agent.streamChat(
      [{ role: "user", content: "/help" }],
      { sessionId: "canvas-help-test" },
    ))
      chunks.push(chunk);
    expect(chunks.filter((c) => c.type === "error")).toEqual([]);
    expect(chunks.filter((c) => c.type === "transition")).toEqual([
      expect.objectContaining({ transitionTo: "canvas-help" }),
    ]);
    expect(chunks.filter((c) => c.type === "message")).toEqual([
      expect.objectContaining({
        content: expect.stringContaining("## Canvas help"),
      }),
    ]);
    expect(calls.ids).toEqual([]);
    expect(chunks.some((c) => c.type === "done")).toBe(true);

    // Canvas resets its selected workflow to general-chat after a completed turn.
    // That subsequent turn can still pause in a child.
    const next: StreamChunk[] = [];
    for await (const chunk of await agent.streamChat(
      [{ role: "user", content: "Save the canvas" }],
      {
        sessionId: "canvas-help-test",
        workflowId: generalChatWorkflow.id,
        context: {
          tenantId: "demo",
          currentDiscoveryCanvas: {
            title: "Demo",
            intro: {
              label: "Demo",
              summary: "A discovery canvas",
              item_text: "Who needs it?",
            },
            sections: {},
          },
        },
      },
    ))
      next.push(chunk);
    expect(next.filter((c) => c.type === "error")).toEqual([]);
    expect(next.find((c) => c.type === "interrupt")).toMatchObject({
      schemaId: "confirm-save",
    });
    expect(calls.ids).toContain("classify-intent");
    expect(next.filter((c) => c.type === "transition")).toEqual([]);
  });
});
