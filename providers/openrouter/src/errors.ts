import {
  errorProperty,
  isControlFlowError,
  normalizeProviderError,
  ProviderConfigurationError,
  ProviderRequestError,
} from "@kortyx/core/errors";
import type { ChatRequest } from "@openrouter/sdk/models";

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
): Error => {
  if (request && !isControlFlowError(error)) {
    const detail = errorProperty(error, "error") ?? error;
    const metadata = errorProperty(detail, "metadata");
    const routing =
      errorProperty(metadata, "routing_funnel") ??
      errorProperty(
        errorProperty(error, "openrouterMetadata"),
        "routing_funnel",
      );
    const failedRoutingStep =
      errorProperty(routing, "failed_routing_step") ??
      errorProperty(metadata, "failed_routing_step");
    const status =
      errorProperty(error, "statusCode") ?? errorProperty(detail, "code");
    const message = errorProperty(error, "message");
    if (
      status === 404 &&
      (failedRoutingStep === "Filter by Parameters" ||
        message ===
          "No endpoints found that can handle the requested parameters." ||
        message ===
          "No endpoints found that can handle the requested parameters")
    ) {
      const requestedParameters = parameterNames(request);
      const requireParameters = request.provider?.requireParameters ?? false;
      const guidance =
        "OpenRouter found no endpoint supporting the requested parameters. Remove unsupported optional parameters or select a compatible model/provider route.";
      const diagnostic = `${guidance} require_parameters=${requireParameters}; requested parameters: ${requestedParameters.join(", ") || "none"}.`;
      return new ProviderRequestError(diagnostic, {
        code: "PROVIDER_PARAMETER_UNSUPPORTED",
        source: "openrouter",
        operation: action,
        status: 404,
        retryable: false,
        safeMessage: diagnostic,
        details: {
          requestedParameters,
          requireParameters,
          ...(failedRoutingStep === "Filter by Parameters"
            ? { failedRoutingStep }
            : {}),
        },
        cause: error,
      });
    }
  }
  return normalizeProviderError("openrouter", action, error);
};
