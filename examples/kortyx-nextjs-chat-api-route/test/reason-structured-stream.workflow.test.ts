import type {
  KortyxInvokeResult,
  KortyxModel,
  KortyxStreamPart,
  ModelOptions,
  ProviderSelector,
} from "kortyx";
import {
  collectStream,
  createAgent,
  createInMemoryFrameworkAdapter,
} from "kortyx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reasonStructuredStreamWorkflow } from "@/workflows/reason-structured-stream.workflow";

const googleMock = vi.hoisted(() => {
  const streamResponses: string[] = [];
  const invokeResponses: KortyxInvokeResult[] = [];

  const stream = vi.fn(async function* () {
    for (const delta of streamResponses) {
      yield {
        type: "text-delta",
        delta,
      } satisfies KortyxStreamPart;
    }
    yield {
      type: "finish",
    } satisfies KortyxStreamPart;
  });

  const invoke = vi.fn(async () => {
    const next = invokeResponses.shift();
    if (!next) throw new Error("No mock invoke response configured");
    return next;
  });

  const provider = Object.assign(
    ((modelId: "gemini-2.5-flash", options?: ModelOptions) => ({
      provider,
      modelId,
      ...(options ? { options } : {}),
    })) as unknown as ProviderSelector<"google", "gemini-2.5-flash">,
    {
      id: "google" as const,
      models: ["gemini-2.5-flash"] as const,
      getModel: vi.fn(
        () =>
          ({
            stream,
            invoke,
          }) satisfies KortyxModel,
      ),
    },
  );

  return {
    invoke,
    invokeResponses,
    provider,
    stream,
    streamResponses,
  };
});

vi.mock("@kortyx/google", () => ({
  createGoogleGenerativeAI: () => googleMock.provider,
  google: googleMock.provider,
}));

describe("reason-structured-stream workflow", () => {
  beforeEach(() => {
    googleMock.streamResponses.length = 0;
    googleMock.invokeResponses.length = 0;
    googleMock.stream.mockClear();
    googleMock.invoke.mockClear();
    googleMock.provider.getModel.mockClear();
  });

  it("streams nested structured output paths through the API example workflow", async () => {
    googleMock.streamResponses.push(
      '{"draft":{"subject":"Beta access"',
      ',"body":"Hello',
      ' customer"',
      ',"bullets":["Try the workspace"',
      ',"Send feedback"]}}',
    );

    const agent = createAgent({
      workflows: [reasonStructuredStreamWorkflow],
      defaultWorkflowId: "reason-structured-stream",
      frameworkAdapter: createInMemoryFrameworkAdapter(),
    });

    const stream = await agent.streamChat(
      [
        {
          role: "user",
          content: "Write a short beta launch email.",
        },
      ],
      {
        sessionId: "nested-structured-test",
        workflowId: "reason-structured-stream",
      },
    );
    const chunks = await collectStream(stream);
    const structuredChunks = chunks.filter(
      (chunk) => chunk.type === "structured-data",
    );

    expect(googleMock.stream).toHaveBeenCalledTimes(1);
    expect(googleMock.invoke).toHaveBeenCalledTimes(0);
    expect(structuredChunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "set",
          path: "draft.subject",
          value: "Beta access",
        }),
        expect.objectContaining({
          kind: "text-delta",
          path: "draft.body",
          delta: "Hello",
        }),
        expect.objectContaining({
          kind: "text-delta",
          path: "draft.body",
          delta: " customer",
        }),
        expect.objectContaining({
          kind: "append",
          path: "draft.bullets",
          items: ["Try the workspace", "Send feedback"],
        }),
        expect.objectContaining({
          kind: "final",
          data: {
            draft: {
              subject: "Beta access",
              body: "Hello customer",
              bullets: ["Try the workspace", "Send feedback"],
            },
          },
        }),
      ]),
    );
  });
});
