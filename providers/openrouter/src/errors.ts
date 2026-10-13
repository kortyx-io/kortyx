import {
  errorProperty,
  FAILURE_LIMITS,
  isControlFlowError,
  normalizeProviderError,
  ProviderConfigurationError,
  ProviderRequestError,
} from "@kortyx/core/errors";
import type { ChatRequest } from "@openrouter/sdk/models";

export type OpenRouterRequestContext = {
  requireParametersSource: "automatic" | "explicit" | "default";
  streamStarted?: boolean;
};

// The SDK may reject a string error code before constructing a typed HTTP/SSE
// error. Inspect its original envelope, bounding JSON parsing, and retain the cause.
const rawEnvelope = (error: unknown): unknown => {
  const raw = errorProperty(error, "rawValue");
  if (typeof raw !== "string") return raw;
  if (raw.length > FAILURE_LIMITS.bytes) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

export {
  ProviderConfigurationError,
  ProviderRequestError,
} from "@kortyx/core/errors";

export const requireApiKey = (apiKey: string | undefined): string => {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new ProviderConfigurationError(
      "OpenRouter provider requires an API key. Pass apiKey to createOpenRouter(...) or set OPENROUTER_API_KEY or KORTYX_OPENROUTER_API_KEY.",
    );
  }
  return apiKey;
};

// Only parameter names are public. Values, prompts and routing funnels stay on
// the original SDK error, which remains available as the live exception cause.
const parameterNames = (request: ChatRequest): string[] => {
  const parameters = {
    temperature: request.temperature,
    top_p: request.topP,
    top_k: request.topK,
    frequency_penalty: request.frequencyPenalty,
    presence_penalty: request.presencePenalty,
    repetition_penalty: request.repetitionPenalty,
    min_p: request.minP,
    top_a: request.topA,
    stop: request.stop,
    seed: request.seed,
    max_tokens: request.maxTokens,
    max_completion_tokens: request.maxCompletionTokens,
    reasoning: request.reasoning,
    response_format: request.responseFormat,
    tools: request.tools,
    tool_choice: request.toolChoice,
    logprobs: request.logprobs,
    top_logprobs: request.topLogprobs,
    logit_bias: request.logitBias,
    parallel_tool_calls: request.parallelToolCalls,
    prediction: request.prediction,
    modalities: request.modalities,
    image_config: request.imageConfig,
    reasoning_effort: request.reasoningEffort,
  };
  return Object.entries(parameters)
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);
};

export const toProviderRequestError = (
  action: string,
  error: unknown,
  request?: ChatRequest,
  context?: OpenRouterRequestContext,
): Error => {
  if (request && !isControlFlowError(error)) {
    const envelope = rawEnvelope(error);
    const detail =
      errorProperty(error, "error") ??
      errorProperty(envelope, "error") ??
      error;
    const metadata = errorProperty(detail, "metadata");
    const routing =
      errorProperty(metadata, "routing_funnel") ??
      errorProperty(
        errorProperty(error, "openrouterMetadata") ??
          errorProperty(error, "openrouter_metadata") ??
          errorProperty(envelope, "openrouter_metadata"),
        "routing_funnel",
      );
    const failedRoutingStep =
      errorProperty(routing, "failed_routing_step") ??
      errorProperty(metadata, "failed_routing_step");
    const rawStatus =
      errorProperty(error, "statusCode") ?? errorProperty(detail, "code");
    const status =
      typeof rawStatus === "number" || typeof rawStatus === "string"
        ? Number(rawStatus)
        : undefined;
    const message =
      errorProperty(detail, "message") ?? errorProperty(error, "message");
    const parameterFilter =
      typeof failedRoutingStep === "string" &&
      failedRoutingStep.trim().toLowerCase() === "filter by parameters";
    const parameterMessage =
      typeof message === "string" &&
      /^no endpoints found that can handle the requested parameters\.?$/i.test(
        message.trim(),
      );
    if (
      status === 404 &&
      (parameterFilter || (failedRoutingStep === undefined && parameterMessage))
    ) {
      const requestedParameters = parameterNames(request);
      const requireParameters = request.provider?.requireParameters ?? false;
      const requireParametersSource =
        context?.requireParametersSource ?? "unknown";
      const featureNames = new Set(["response_format", "tools", "tool_choice"]);
      const featureParameters = requestedParameters.filter((name) =>
        featureNames.has(name),
      );
      const otherParameters = requestedParameters.filter(
        (name) => !featureNames.has(name),
      );
      const usesPreset = Boolean(
        request.model?.includes("@preset/") ||
          request.models?.some((model) => model.includes("@preset/")),
      );
      const automaticFeatures = [
        ...(request.tools?.length ? ["tool calling"] : []),
        ...(request.responseFormat?.type === "json_schema"
          ? ["structured output"]
          : []),
      ];
      const origin =
        requireParametersSource === "automatic"
          ? `enabled automatically by Kortyx for ${automaticFeatures.join(" and ")}`
          : requireParametersSource === "explicit"
            ? "configured explicitly by the caller"
            : requireParametersSource === "default"
              ? "not explicitly set; provider default"
              : "setting origin unavailable";
      const guidance =
        "Remove unsupported optional parameters only if your application can omit them, or select a compatible model/provider route.";
      const override =
        requireParametersSource === "automatic"
          ? " To override strict parameter routing, set providerOptions.openrouter.provider.requireParameters=false; unsupported controls, including tools/structured output, may then be ignored."
          : "";
      const preset = usesPreset
        ? " Preset settings may also affect routing; this list only covers parameters sent by Kortyx."
        : "";
      const diagnostic = `OpenRouter found no endpoint supporting the requested parameters. require_parameters=${requireParameters} (${origin}). Tool/output parameters: ${featureParameters.join(", ") || "none"}. Other requested parameters: ${otherParameters.join(", ") || "none"}. ${guidance}${override}${preset}`;
      return new ProviderRequestError(
        typeof message === "string" ? message : diagnostic,
        {
          code: "PROVIDER_PARAMETER_UNSUPPORTED",
          source: "openrouter",
          operation: action,
          status: 404,
          retryable: false,
          safeMessage: diagnostic,
          details: {
            requestedParameters,
            requireParameters,
            requireParametersSource,
            featureParameters,
            otherParameters,
            usesPreset,
            ...(parameterFilter
              ? { failedRoutingStep: "Filter by Parameters" }
              : {}),
          },
          cause: error,
        },
      );
    }
  }
  const name = errorProperty(error, "name");
  const originalMessage = errorProperty(error, "message");
  if (
    name === "ResponseValidationError" ||
    (context?.streamStarted &&
      (name === "SDKValidationError" || name === "ZodError"))
  ) {
    return new ProviderRequestError(
      typeof originalMessage === "string"
        ? originalMessage
        : "OpenRouter SDK response validation failed.",
      {
        code: "PROVIDER_INVALID_RESPONSE",
        source: "openrouter",
        operation: action,
        retryable: false,
        safeMessage:
          "OpenRouter returned a response that did not match its SDK schema. Inspect the original SDK error for details.",
        cause: error,
      },
    );
  }
  return normalizeProviderError("openrouter", action, error);
};
