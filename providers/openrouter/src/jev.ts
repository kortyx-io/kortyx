import type {
  KortyxInvokeResult,
  KortyxModel,
  KortyxPromptMessage,
  KortyxStreamPart,
  KortyxUsage,
  KortyxWarning,
  ModelOptions,
} from "@kortyx/providers";
import type {
  DecisionsRequest,
  DecisionsResponse,
} from "@openrouter/sdk/models";
import { z } from "zod";
import { createOpenRouterClient } from "./client.js";
import {
  ProviderConfigurationError,
  ProviderRequestError,
  toProviderRequestError,
} from "./errors.js";
import { getOpenRouterOptions } from "./messages.js";
import { PROVIDER_ID } from "./models.js";
import type { ProviderSettings } from "./types.js";

const JEV_SCHEMA_METADATA_KEY = "x-kortyx-openrouter-system-one";
const NATIVE_OUTPUT_MARKER = "~kortyx" as const;

export type JevQuestions = DecisionsRequest["questions"];

type ChoiceOutput<Question> = Question extends {
  type: "choice";
  criteria: infer Criteria;
}
  ? Extract<keyof Criteria, string>
  : never;

export type JevOutput<Questions extends JevQuestions> = {
  [Key in keyof Questions]: Questions[Key] extends { type: "choice" }
    ? ChoiceOutput<Questions[Key]>
    : Questions[Key] extends { type: "score" | "noul" }
      ? number
      : never;
};

export type JevOutputSchema<Questions extends JevQuestions> = z.ZodType<
  JevOutput<Questions>
> & {
  readonly [NATIVE_OUTPUT_MARKER]: { readonly nativeOutput: true };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Builds the regular output schema that lets `useReason` call a TypeSafe Jev
 * model through OpenRouter's System One API.
 */
export function jevOutputSchema<const Questions extends JevQuestions>(
  questions: Questions,
): JevOutputSchema<Questions> {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, question] of Object.entries(questions)) {
    switch (question.type) {
      case "choice": {
        const choices = Object.keys(question.criteria);
        if (choices.length === 0)
          throw new ProviderConfigurationError(
            `Jev choice question "${name}" requires at least one criterion.`,
          );
        if (choices.length > 255)
          throw new ProviderConfigurationError(
            `Jev choice question "${name}" accepts at most 255 criteria.`,
          );
        shape[name] = z.enum(choices as [string, ...string[]]);
        break;
      }
      case "score":
        if (question.criteria.length < 2 || question.criteria.length > 10)
          throw new ProviderConfigurationError(
            `Jev score question "${name}" requires between 2 and 10 criteria.`,
          );
        shape[name] = z
          .number()
          .min(0)
          .max(question.criteria.length - 1);
        break;
      case "noul":
        shape[name] = z.number().min(0).max(1);
        break;
    }
  }

  const schema = z.object(shape).meta({
    [JEV_SCHEMA_METADATA_KEY]: { questions },
  });
  Object.defineProperty(schema, NATIVE_OUTPUT_MARKER, {
    value: Object.freeze({ nativeOutput: true }),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return schema as unknown as JevOutputSchema<Questions>;
}

export const isJevModelId = (modelId: string): boolean =>
  /^(?:typesafe\/)?jev(?:-|$)/i.test(modelId.replace(/^~/, ""));

const getQuestions = (options: ModelOptions): JevQuestions => {
  const schema =
    options.responseFormat?.type === "json"
      ? options.responseFormat.schema
      : undefined;
  const metadata = isRecord(schema)
    ? schema[JEV_SCHEMA_METADATA_KEY]
    : undefined;
  const questions = isRecord(metadata) ? metadata.questions : undefined;
  if (!isRecord(questions) || Object.keys(questions).length === 0)
    throw new ProviderConfigurationError(
      "TypeSafe Jev models require outputSchema: jevOutputSchema({...}). Do not override it with an explicit responseFormat.",
    );
  return questions as JevQuestions;
};

const unsupportedWarnings = (options: ModelOptions): KortyxWarning[] => {
  const warnings: KortyxWarning[] = [];
  const warn = (feature: string, details: string) =>
    warnings.push({ type: "unsupported", feature, details });
  if (options.temperature !== undefined)
    warn("temperature", "TypeSafe Jev does not use sampling temperature.");
  if (options.maxOutputTokens !== undefined)
    warn(
      "maxOutputTokens",
      "TypeSafe Jev returns decisions rather than generated tokens.",
    );
  if (options.stopSequences !== undefined)
    warn("stopSequences", "TypeSafe Jev does not generate stoppable text.");
  if (options.reasoning !== undefined)
    warn("reasoning", "TypeSafe Jev does not expose chat reasoning controls.");
  if (options.streaming !== false)
    warnings.push({
      type: "compatibility",
      feature: "streaming",
      details:
        "OpenRouter System One is non-streaming; Kortyx emits one final result.",
    });
  return warnings;
};

const toState = (
  messages: KortyxPromptMessage[],
): DecisionsRequest["state"] => {
  if (messages.length === 1 && messages[0]?.role === "user")
    return messages[0].content;
  return {
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.name ? { name: message.name } : {}),
    })),
  };
};

const toOutput = (
  questions: JevQuestions,
  response: DecisionsResponse,
): Record<string, string | number> => {
  const output: Record<string, string | number> = {};
  for (const [name, question] of Object.entries(questions)) {
    const answer = response.answers[name];
    if (!answer || answer.type !== question.type)
      throw new ProviderRequestError(
        `OpenRouter returned no compatible Jev answer for question "${name}".`,
      );
    switch (answer.type) {
      case "choice":
        output[name] = answer.choice;
        break;
      case "score":
        output[name] = answer.score;
        break;
      case "noul":
        output[name] = answer.noul;
        break;
      default:
        throw new ProviderRequestError(
          `OpenRouter returned an unsupported Jev answer for question "${name}".`,
        );
    }
  }
  return output;
};

const mapUsage = (response: DecisionsResponse): KortyxUsage => ({
  input: response.usage.inputTokens,
  output: response.usage.outputTokens,
  total: response.usage.inputTokens + response.usage.outputTokens,
  raw: response.usage as unknown as Record<string, unknown>,
});

export const createJevModel = (
  modelId: string,
  settings: ProviderSettings,
  options: ModelOptions,
  loadApiKey: () => string,
): KortyxModel => {
  if (options.tools?.length)
    throw new ProviderConfigurationError(
      "TypeSafe Jev models do not support tools in useReason.",
    );
  const questions = getQuestions(options);
  const warnings = unsupportedWarnings(options);
  const openrouter = getOpenRouterOptions(options);
  const supportedOptionKeys = new Set([
    "provider",
    "sessionId",
    "trace",
    "user",
  ]);
  for (const key of Object.keys(openrouter)) {
    if (!supportedOptionKeys.has(key))
      warnings.push({
        type: "unsupported",
        feature: `providerOptions.openrouter.${key}`,
        details: "This OpenRouter chat option is not used by System One.",
      });
  }

  let client: ReturnType<typeof createOpenRouterClient> | undefined;
  const getClient = () => {
    client ??= createOpenRouterClient(settings, loadApiKey);
    return client;
  };

  const invoke = async (
    messages: KortyxPromptMessage[],
  ): Promise<KortyxInvokeResult> => {
    try {
      const request: DecisionsRequest = {
        model: modelId,
        state: toState(messages),
        questions,
        ...(openrouter.provider !== undefined
          ? { provider: openrouter.provider }
          : {}),
        ...(openrouter.sessionId !== undefined
          ? { sessionId: openrouter.sessionId }
          : {}),
        ...(openrouter.trace !== undefined ? { trace: openrouter.trace } : {}),
        ...(openrouter.user !== undefined ? { user: openrouter.user } : {}),
      };
      const response = await getClient().decide(request, options.abortSignal);
      const output = toOutput(questions, response);
      return {
        role: "assistant",
        content: JSON.stringify(output),
        raw: response,
        usage: mapUsage(response),
        finishReason: { unified: "stop", raw: "stop" },
        ...(warnings.length ? { warnings } : {}),
        providerMetadata: {
          providerId: PROVIDER_ID,
          api: "system-one",
          modelId,
          responseId: response.id,
          responseModel: response.model,
          provider: response.provider,
          cost: response.usage.cost,
          answers: response.answers,
        },
      };
    } catch (error) {
      throw toProviderRequestError("make a System One decision", error);
    }
  };

  return {
    supportsToolStreaming: false,
    invoke,
    async *stream(
      messages: KortyxPromptMessage[],
    ): AsyncGenerator<KortyxStreamPart> {
      try {
        const result = await invoke(messages);
        if (result.content)
          yield {
            type: "text-delta",
            delta: result.content,
            raw: result.raw,
          };
        yield { ...result, type: "finish" };
      } catch (error) {
        yield { type: "error", error };
      }
    },
  };
};
