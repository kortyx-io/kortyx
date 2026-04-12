import { defineWorkflow } from "@kortyx/core";
import { useInterrupt, useStructuredData } from "@kortyx/hooks";
import { createInMemoryFrameworkAdapter } from "@kortyx/runtime";
import { collectBufferedStream } from "@kortyx/stream";
import { describe, expect, it } from "vitest";
import { createAgent } from "../src";

const askLabelNode = async () => {
  useStructuredData({
    dataType: "hooks",
    data: { step: "ask-label" },
  });

  const label = String(
    await useInterrupt({
      request: {
        kind: "text",
        question: "Enter a label",
      },
    }),
  ).trim();

  useStructuredData({
    dataType: "hooks",
    data: { step: "label-captured", label },
  });

  return {
    data: { label },
    ui: { message: `Label: ${label}` },
  };
};

const askChoiceNode = async () => {
  useStructuredData({
    dataType: "hooks",
    data: { step: "ask-choice" },
  });

  const action = String(
    await useInterrupt({
      request: {
        kind: "choice",
        question: "Choose next action",
        options: [
          { id: "review", label: "Review" },
          { id: "fix", label: "Fix" },
          { id: "ship", label: "Ship" },
        ],
      },
    }),
  ).trim();

  useStructuredData({
    dataType: "hooks",
    data: { step: "choice-captured", action },
  });

  return {
    data: { action },
    ui: { message: `Action: ${action}` },
  };
};

const finalNode = async ({
  input,
}: {
  input: { label?: string; action?: string };
}) => ({
  ui: {
    message: `Done: ${input.label ?? ""}:${input.action ?? ""}`,
  },
});

const workflow = defineWorkflow({
  id: "sequential-interrupt-test",
  version: "1.0.0",
  nodes: {
    askLabel: { run: askLabelNode, params: {} },
    askChoice: { run: askChoiceNode, params: {} },
    final: { run: finalNode, params: {} },
  },
  edges: [
    ["__start__", "askLabel"],
    ["askLabel", "askChoice"],
    ["askChoice", "final"],
    ["final", "__end__"],
  ],
});

describe("sequential interrupt resume", () => {
  it("emits the next interrupt after resuming a text interrupt", async () => {
    const frameworkAdapter = createInMemoryFrameworkAdapter();
    const agent = createAgent({
      workflows: [workflow],
      defaultWorkflowId: "sequential-interrupt-test",
      frameworkAdapter,
    });
    const sessionId = `test-${Date.now()}`;

    const first = await collectBufferedStream(
      await agent.streamChat([{ role: "user", content: "start" }], {
        sessionId,
        workflowId: "sequential-interrupt-test",
      }),
    );

    const firstInterrupt = first.chunks.find(
      (chunk) => chunk.type === "interrupt",
    );

    expect(firstInterrupt).toMatchObject({
      type: "interrupt",
      node: "askLabel",
      input: {
        kind: "text",
        question: "Enter a label",
      },
    });

    const second = await collectBufferedStream(
      await agent.streamChat(
        [
          {
            role: "user",
            content: "candidate-a",
            metadata: {
              resume: {
                token:
                  firstInterrupt && "resumeToken" in firstInterrupt
                    ? firstInterrupt.resumeToken
                    : "",
                requestId:
                  firstInterrupt && "requestId" in firstInterrupt
                    ? firstInterrupt.requestId
                    : "",
                selected: ["candidate-a"],
              },
            },
          },
        ],
        { sessionId, workflowId: "sequential-interrupt-test" },
      ),
    );

    const secondInterrupts = second.chunks.filter(
      (chunk) => chunk.type === "interrupt",
    );

    expect(secondInterrupts).toHaveLength(1);
    expect(secondInterrupts[0]).toMatchObject({
      type: "interrupt",
      node: "askChoice",
      input: {
        kind: "choice",
        question: "Choose next action",
      },
    });

    const secondInterrupt = secondInterrupts[0];

    const third = await collectBufferedStream(
      await agent.streamChat(
        [
          {
            role: "user",
            content: "fix",
            metadata: {
              resume: {
                token:
                  secondInterrupt && "resumeToken" in secondInterrupt
                    ? secondInterrupt.resumeToken
                    : "",
                requestId:
                  secondInterrupt && "requestId" in secondInterrupt
                    ? secondInterrupt.requestId
                    : "",
                selected: ["fix"],
              },
            },
          },
        ],
        { sessionId, workflowId: "sequential-interrupt-test" },
      ),
    );

    expect(third.text).toContain("Done: candidate-a:fix");
    expect(third.chunks.some((chunk) => chunk.type === "done")).toBe(true);
  });
});
