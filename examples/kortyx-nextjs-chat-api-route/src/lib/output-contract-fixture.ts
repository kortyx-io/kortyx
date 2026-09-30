import type {
  KortyxInvokeResult,
  KortyxPromptMessage,
  KortyxStreamPart,
  ProviderInstance,
  ProviderModelRef,
} from "kortyx";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const responseFor = (messages: KortyxPromptMessage[]): KortyxInvokeResult => {
  const invalidDraft = messages.some(
    (message) =>
      message.role === "user" && message.content.includes("/invalid"),
  );
  const pending =
    messages.at(-2)?.role === "tool" &&
    messages
      .at(-2)
      ?.content.startsWith("Generating the requested structured output.")
      ? messages.at(-2)
      : undefined;
  if (pending) {
    const content =
      invalidDraft && pending.name === "kortyx_stream_emit__card"
        ? '{"title":"Incomplete draft","body":"This partial must be invalidated."}'
        : pending.name === "kortyx_stream_return__completed"
          ? '{"summary":"The rollout is ready for review.","recommendedAction":"Share the plan with the team."}'
          : messages.filter(
                (message) =>
                  message.role === "tool" &&
                  message.content.includes('"emitted":true'),
              ).length === 0
            ? '{"title":"Launch plan","body":"First, align the team on scope.","highlights":["Set owners","Agree on timing"]}'
            : '{"title":"Delivery check","body":"Next, verify the rollout gates.","highlights":["Test the path","Watch live signals"]}';
    return { content };
  }

  const emittedCount = messages.filter(
    (message) =>
      message.role === "tool" && message.content.includes('"emitted":true'),
  ).length;
  if (emittedCount < 2) {
    return {
      content:
        emittedCount === 0
          ? "I’ll draft a plan."
          : "The first draft is ready. I’ll add a delivery check.",
      toolCalls: [
        {
          id: `fixture-emit-${emittedCount}`,
          name: "kortyx_stream_emit__card",
          input: {
            instruction:
              emittedCount === 0
                ? "Draft the launch plan."
                : "Draft the delivery check.",
          },
        },
      ],
    };
  }
  return {
    content: "Both cards are ready. Here’s the recommendation.",
    toolCalls: [
      {
        id: "fixture-return",
        name: "kortyx_stream_return__completed",
        input: { instruction: "Summarize the rollout recommendation." },
      },
    ],
  };
};

const provider: ProviderInstance = {
  id: "output-contract-fixture",
  models: ["fixture"],
  getModel: (modelId) => {
    if (modelId !== "fixture")
      throw new Error(`Unknown fixture model: ${modelId}`);
    return {
      supportsToolStreaming: true,
      invoke: async (messages) => responseFor(messages),
      stream: async function* (messages): AsyncIterable<KortyxStreamPart> {
        const response = responseFor(messages);
        const content = response.content;
        const cuts = content.startsWith("{")
          ? [Math.min(28, content.length), Math.min(55, content.length)]
          : [Math.min(11, content.length)];
        let start = 0;
        for (const end of [...cuts, content.length]) {
          if (end <= start) continue;
          yield { type: "text-delta", delta: content.slice(start, end) };
          start = end;
          await pause(250);
        }
        yield {
          type: "finish",
          finishReason: { unified: "stop" },
          ...(response.toolCalls ? { toolCalls: response.toolCalls } : {}),
        };
      },
    };
  },
};

export const outputContractFixtureModel: ProviderModelRef = {
  provider,
  modelId: "fixture",
};
