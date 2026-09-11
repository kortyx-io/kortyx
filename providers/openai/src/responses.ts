import type {
  KortyxInvokeResult,
  KortyxModel,
  KortyxPromptMessage,
  KortyxStreamPart,
  KortyxUsage,
  KortyxWarning,
  ModelOptions,
} from "@kortyx/providers";
import { assertOk, readSseEvents } from "./client";
import {
  ProviderConfigurationError,
  ProviderRequestError,
  toProviderRequestError,
} from "./errors";
import type { ProviderSettings } from "./types";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const openAIOptions = (
  options: ModelOptions,
): Record<string, unknown> =>
  record(options.providerOptions?.openai)
    ? options.providerOptions.openai
    : (options.providerOptions ?? {});

export function createResponsesRequest(
  model: string,
  messages: KortyxPromptMessage[],
  options: ModelOptions,
  stream: boolean,
) {
  const extra = openAIOptions(options);
  if (options.stopSequences?.length)
    throw new ProviderConfigurationError(
      "OpenAI Responses does not support stopSequences.",
    );
  if (options.reasoning?.maxTokens !== undefined)
    throw new ProviderConfigurationError(
      "OpenAI Responses does not support reasoning.maxTokens. Use maxOutputTokens for the combined output budget.",
    );
  if (options.reasoning?.includeThoughts)
    throw new ProviderConfigurationError(
      "OpenAI Responses reasoning summaries are not exposed by Kortyx yet.",
    );
  const effort = extra.reasoningEffort ?? options.reasoning?.effort;
  const format = options.responseFormat;
  if (
    format?.type === "json" &&
    format.schema !== undefined &&
    extra.structuredOutputs === false
  ) {
    throw new ProviderConfigurationError(
      "An explicit responseFormat.schema requires structuredOutputs to be enabled.",
    );
  }
  const input: unknown[] = [];
  for (const message of messages) {
    if (message.continuation) {
      if (
        message.continuation.providerId !== "openai" ||
        message.continuation.api !== "responses"
      ) {
        throw new ProviderConfigurationError(
          "Cannot use another provider's continuation with OpenAI Responses.",
        );
      }
      input.push(...message.continuation.items);
    } else if (message.role === "tool") {
      if (!message.toolCallId)
        throw new ProviderConfigurationError(
          "Tool results require a toolCallId.",
        );
      input.push({
        type: "function_call_output",
        call_id: message.toolCallId,
        output: message.content,
      });
    } else {
      if (message.role === "system" && extra.systemMessageMode === "remove")
        continue;
      if (message.content || !message.toolCalls?.length)
        input.push({
          role:
            message.role === "system"
              ? extra.systemMessageMode === "system"
                ? "system"
                : "developer"
              : message.role,
          content: message.content,
        });
      for (const call of message.toolCalls ?? [])
        input.push({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments: JSON.stringify(call.input),
        });
    }
  }
  const reasoningModel = /^(o[134]|gpt-[5-9])/.test(model);
  return {
    model,
    input,
    stream,
    store: extra.store ?? false,
    include: ["reasoning.encrypted_content"],
    ...(effort !== undefined ? { reasoning: { effort } } : {}),
    ...(options.temperature !== undefined &&
    (!reasoningModel || effort === "none")
      ? { temperature: options.temperature }
      : {}),
    ...(options.maxOutputTokens !== undefined ||
    extra.maxCompletionTokens !== undefined
      ? {
          max_output_tokens:
            options.maxOutputTokens ?? extra.maxCompletionTokens,
        }
      : {}),
    ...(extra.serviceTier !== undefined
      ? { service_tier: extra.serviceTier }
      : {}),
    ...(extra.metadata !== undefined ? { metadata: extra.metadata } : {}),
    ...(format?.type === "json"
      ? {
          text: {
            format:
              format.schema !== undefined
                ? {
                    type: "json_schema",
                    name: format.name ?? "response",
                    schema: format.schema,
                    strict: extra.strictJsonSchema !== false,
                  }
                : { type: "json_object" },
          },
        }
      : {}),
    ...(options.tools?.length
      ? {
          tools: options.tools.map((tool) => ({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
            strict: false,
          })),
        }
      : {}),
  };
}

export function responsesResult(
  payload: unknown,
  modelId: string,
): KortyxInvokeResult {
  if (!record(payload) || !Array.isArray(payload.output))
    throw new ProviderRequestError(
      "OpenAI Responses returned an invalid response payload.",
    );
  const rawUsage = record(payload.usage) ? payload.usage : undefined;
  const usage: KortyxUsage | undefined = rawUsage
    ? {
        ...(typeof rawUsage.input_tokens === "number"
          ? { input: rawUsage.input_tokens }
          : {}),
        ...(typeof rawUsage.output_tokens === "number"
          ? { output: rawUsage.output_tokens }
          : {}),
        ...(typeof rawUsage.total_tokens === "number"
          ? { total: rawUsage.total_tokens }
          : {}),
        ...(record(rawUsage.output_tokens_details) &&
        typeof rawUsage.output_tokens_details.reasoning_tokens === "number"
          ? { reasoning: rawUsage.output_tokens_details.reasoning_tokens }
          : {}),
        ...(record(rawUsage.input_tokens_details) &&
        typeof rawUsage.input_tokens_details.cached_tokens === "number"
          ? { cacheRead: rawUsage.input_tokens_details.cached_tokens }
          : {}),
        ...(record(rawUsage.input_tokens_details) &&
        typeof rawUsage.input_tokens_details.cache_write_tokens === "number"
          ? { cacheWrite: rawUsage.input_tokens_details.cache_write_tokens }
          : {}),
        outputIncludesReasoning: true,
        inputIncludesCacheRead: true,
        inputIncludesCacheWrite: true,
        raw: rawUsage,
      }
    : undefined;
  const providerMetadata = {
    providerId: "openai",
    api: "responses",
    modelId,
    responseId: payload.id,
    responseModel: payload.model,
    status: payload.status,
    reasoning: payload.reasoning,
    incompleteDetails: payload.incomplete_details,
    serviceTier: payload.service_tier,
  };
  const fail = (message: string, reason: string): never => {
    throw Object.assign(new ProviderRequestError(message), {
      usage,
      providerMetadata,
      finishReason: { unified: reason, raw: payload.status },
    });
  };
  if (payload.status !== "completed") {
    const detail = record(payload.incomplete_details)
      ? payload.incomplete_details.reason
      : record(payload.error)
        ? payload.error.message
        : payload.status;
    return fail(
      `OpenAI Responses did not complete: ${String(detail)}.`,
      payload.status === "incomplete" ? "length" : "error",
    );
  }
  let content = "";
  const toolCalls: NonNullable<KortyxInvokeResult["toolCalls"]> = [];
  for (const item of payload.output) {
    if (!record(item))
      return fail("OpenAI Responses returned an invalid output item.", "error");
    if (item.type === "reasoning") continue;
    if (item.type === "function_call") {
      if (
        typeof item.call_id !== "string" ||
        !item.call_id ||
        typeof item.name !== "string" ||
        typeof item.arguments !== "string"
      )
        return fail(
          "OpenAI Responses returned an invalid function call.",
          "error",
        );
      let input: unknown;
      try {
        input = JSON.parse(item.arguments);
      } catch {
        return fail(`Invalid JSON arguments for tool ${item.name}.`, "error");
      }
      if (toolCalls.some((call) => call.id === item.call_id))
        return fail(
          "OpenAI Responses returned duplicate function call identifiers.",
          "error",
        );
      toolCalls.push({ id: item.call_id, name: item.name, input });
    } else if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (!record(part)) continue;
        if (part.type === "refusal")
          return fail(
            `OpenAI refused the request: ${String(part.refusal)}`,
            "content-filter",
          );
        if (part.type === "output_text" && typeof part.text === "string")
          content += part.text;
      }
    } else
      return fail(
        `Unsupported OpenAI Responses output item: ${String(item.type)}.`,
        "error",
      );
  }
  if (!content && !toolCalls.length)
    return fail(
      "OpenAI Responses completed without text or function calls.",
      "error",
    );
  return {
    role: "assistant",
    content,
    raw: payload,
    ...(usage ? { usage } : {}),
    providerMetadata,
    finishReason: {
      unified: toolCalls.length ? "tool-calls" : "stop",
      raw: "completed",
    },
    ...(toolCalls.length ? { toolCalls } : {}),
    continuation: {
      providerId: "openai",
      api: "responses",
      items: payload.output,
    },
  };
}

export function createResponsesModel(
  modelId: string,
  settings: ProviderSettings,
  options: ModelOptions,
  apiKey: () => string,
): KortyxModel {
  const extra = openAIOptions(options);
  const warnings: KortyxWarning[] = [];
  const supported = new Set([
    "api",
    "reasoningEffort",
    "maxCompletionTokens",
    "serviceTier",
    "store",
    "metadata",
    "systemMessageMode",
    "structuredOutputs",
    "strictJsonSchema",
  ]);
  const unsupported = Object.keys(extra).filter((key) => !supported.has(key));
  if (unsupported.length)
    warnings.push({
      type: "unsupported",
      feature: "providerOptions",
      details: `OpenAI Responses ignores unsupported options: ${unsupported.join(", ")}.`,
    });
  if (
    options.temperature !== undefined &&
    /^(o[134]|gpt-[5-9])/.test(modelId) &&
    (extra.reasoningEffort ?? options.reasoning?.effort) !== "none"
  )
    warnings.push({
      type: "unsupported",
      feature: "temperature",
      details: "Temperature is omitted for this reasoning model and effort.",
    });
  const post = async (messages: KortyxPromptMessage[], stream: boolean) => {
    const body = createResponsesRequest(modelId, messages, options, stream);
    const response = await (settings.fetch ?? globalThis.fetch)(
      `${(settings.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "")}/responses`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        ...(options.abortSignal ? { signal: options.abortSignal } : {}),
      },
    );
    await assertOk(response, "create response");
    return response;
  };
  const withWarnings = (result: KortyxInvokeResult): KortyxInvokeResult => ({
    ...result,
    ...(warnings.length ? { warnings } : {}),
  });
  return {
    supportsToolStreaming: true,
    async invoke(messages) {
      try {
        return withWarnings(
          responsesResult(await (await post(messages, false)).json(), modelId),
        );
      } catch (error) {
        throw toProviderRequestError("create response", error);
      }
    },
    async *stream(messages): AsyncGenerator<KortyxStreamPart> {
      try {
        if (options.streaming === false) {
          const result = withWarnings(
            responsesResult(
              await (await post(messages, false)).json(),
              modelId,
            ),
          );
          if (result.content)
            yield { type: "text-delta", delta: result.content };
          yield { ...result, type: "finish" };
          return;
        }
        const response = await post(messages, true);
        for await (const data of readSseEvents(response)) {
          const event: unknown = JSON.parse(data);
          if (!record(event))
            throw new ProviderRequestError("Invalid Responses stream event.");
          if (
            event.type === "response.output_text.delta" &&
            typeof event.delta === "string"
          )
            yield { type: "text-delta", delta: event.delta };
          if (event.type === "error")
            throw new ProviderRequestError(
              `OpenAI Responses stream failed: ${String(event.message)}`,
            );
          if (
            event.type === "response.completed" ||
            event.type === "response.incomplete" ||
            event.type === "response.failed"
          ) {
            const result = withWarnings(
              responsesResult(event.response, modelId),
            );
            yield { ...result, type: "finish" };
            return;
          }
        }
        throw new ProviderRequestError(
          "OpenAI Responses stream ended without a terminal response.",
        );
      } catch (error) {
        yield {
          type: "error",
          error: toProviderRequestError("stream response", error),
        };
      }
    },
  };
}
