import { describe, expect, it } from "vitest";
import type {
  KortyxInvokeResult,
  KortyxModel,
  KortyxPromptMessage,
  KortyxStreamPart,
} from "../src/types";

const DEFAULT_MESSAGES: KortyxPromptMessage[] = [
  {
    role: "system",
    content: "You are a concise assistant.",
  },
  {
    role: "user",
    content: "Say hello.",
  },
];

type ProviderInvokeConformanceCase = {
  createModel: () => KortyxModel | Promise<KortyxModel>;
  messages?: KortyxPromptMessage[];
  assert: (result: KortyxInvokeResult) => void | Promise<void>;
};

type ProviderStreamConformanceCase = {
  createModel: () => KortyxModel | Promise<KortyxModel>;
  messages?: KortyxPromptMessage[];
  assert: (args: {
    parts: KortyxStreamPart[];
    text: string;
    finishPart?: Extract<KortyxStreamPart, { type: "finish" }>;
  }) => void | Promise<void>;
};

type ProviderAbortConformanceCase = {
  createModel: (signal: AbortSignal) => KortyxModel | Promise<KortyxModel>;
  messages?: KortyxPromptMessage[];
  mode?: "invoke" | "stream";
  afterStart?: (controller: AbortController) => void;
  assert: (error: unknown) => void | Promise<void>;
};

export type ProviderConformanceSuiteArgs = {
  providerName: string;
  invoke: ProviderInvokeConformanceCase;
  stream: ProviderStreamConformanceCase;
  abort?: ProviderAbortConformanceCase;
};

const collectStreamParts = async (
  iterable: AsyncIterable<KortyxStreamPart>,
): Promise<KortyxStreamPart[]> => {
  const parts: KortyxStreamPart[] = [];
  for await (const part of iterable) {
    parts.push(part);
  }
  return parts;
};

export const getTextFromParts = (parts: KortyxStreamPart[]): string =>
  parts
    .filter(
      (part): part is Extract<KortyxStreamPart, { type: "text-delta" }> =>
        part.type === "text-delta",
    )
    .map((part) => part.delta)
    .join("");

export function describeProviderConformance(
  args: ProviderConformanceSuiteArgs,
): void {
  describe(`${args.providerName} provider conformance`, () => {
    it("normalizes invoke responses", async () => {
      const model = await args.invoke.createModel();
      const result = await model.invoke(
        args.invoke.messages ?? DEFAULT_MESSAGES,
      );

      expect(result.content).toEqual(expect.any(String));
      await args.invoke.assert(result);
    });

    it("streams typed parts and a finish event", async () => {
      const model = await args.stream.createModel();
      const parts = await collectStreamParts(
        await model.stream(args.stream.messages ?? DEFAULT_MESSAGES),
      );
      const finishPart = parts.find(
        (part): part is Extract<KortyxStreamPart, { type: "finish" }> =>
          part.type === "finish",
      );

      expect(parts.length).toBeGreaterThan(0);
      expect(parts.every((part) => typeof part === "object")).toBe(true);
      expect(finishPart).toBeDefined();

      await args.stream.assert({
        parts,
        text: getTextFromParts(parts),
        finishPart,
      });
    });

    if (args.abort) {
      const abortCase = args.abort;

      it("forwards abortSignal into provider transport", async () => {
        const controller = new AbortController();
        const model = await abortCase.createModel(controller.signal);
        const mode = abortCase.mode ?? "invoke";
        const messages = abortCase.messages ?? DEFAULT_MESSAGES;

        const operation =
          mode === "stream"
            ? collectStreamParts(await model.stream(messages))
            : model.invoke(messages);

        if (abortCase.afterStart) {
          abortCase.afterStart(controller);
        } else {
          controller.abort();
        }

        let captured: unknown;
        try {
          await operation;
        } catch (error) {
          captured = error;
        }

        expect(captured).toBeDefined();
        await abortCase.assert(captured);
      });
    }
  });
}
