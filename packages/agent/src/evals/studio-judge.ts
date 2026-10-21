import { redactDiagnosticText } from "@kortyx/telemetry-contracts";
import {
  EvalConfigurationError,
  EvalJudgeIdentitySchema,
  StudioEvalJudgeRequestSchema,
  StudioEvalJudgeResponseSchema,
} from "./contracts";
import { compactEvalObservation } from "./evidence";
import type { EvalJudge, StudioEvalJudgeOptions } from "./types";

async function readJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  if (!response.body) {
    throw new Error(
      `Studio judge returned HTTP ${response.status} with no response body.`,
    );
  }
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1_000_000)
        throw new Error("Studio judge response is too large.");
      text += decoder.decode(part.value, { stream: true });
    }
    signal.throwIfAborted();
    text += decoder.decode();
    if (!response.ok)
      throw Object.assign(
        new Error(
          `Studio judge returned HTTP ${response.status}: ${redactDiagnosticText(text)}`,
        ),
        {
          statusCode: response.status,
          responseBody: redactDiagnosticText(text),
        },
      );
    return JSON.parse(text);
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Discover and pin the Studio backend's judge; grading never runs in the browser. */
export async function createStudioEvalJudge(
  options: StudioEvalJudgeOptions,
): Promise<EvalJudge> {
  const base = new URL(options.url);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.pathname !== "/" && base.pathname !== "") ||
    (base.protocol !== "https:" &&
      !(options.allowInsecureHttp && base.protocol === "http:")) ||
    !options.apiKey.trim() ||
    !options.environment.trim()
  )
    throw new EvalConfigurationError(
      "Studio judging requires an API origin, key and environment, with HTTPS or explicit local HTTP opt-in.",
    );
  const endpoint = new URL("/v1/studio/evals/judge", base);
  endpoint.searchParams.set("includeInstructions", "true");
  const discovery = new URL(endpoint);
  discovery.searchParams.set("environment", options.environment);
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
    : AbortSignal.timeout(15_000);
  const identity = EvalJudgeIdentitySchema.parse(
    await readJson(
      await fetch(discovery, {
        headers: { authorization: `Bearer ${options.apiKey}` },
        redirect: "error",
        signal,
      }),
      signal,
    ),
  );
  if (identity.location !== "studio")
    throw new EvalConfigurationError(
      "Endpoint did not provide a Studio judge.",
    );
  return {
    ...identity,
    location: "studio",
    async grade(input) {
      if (input.prompt && !identity.promptTemplates)
        throw new EvalConfigurationError(
          "Studio judge does not support prompt templates. Update the Studio backend.",
        );
      const request = StudioEvalJudgeRequestSchema.parse({
        ...(input.prompt ? { prompt: input.prompt } : {}),
        environment: options.environment,
        judge: {
          id: identity.id,
          version: identity.version,
          location: identity.location,
        },
        criterion: input.criterion,
        input: input.input,
        observation: compactEvalObservation(input.observation),
        reference: input.reference,
        conversation: input.conversation.map(
          ({ evidence: _evidence, ...step }) => ({
            ...step,
            observation: compactEvalObservation(step.observation),
          }),
        ),
      });
      const signal = AbortSignal.any([
        input.signal,
        AbortSignal.timeout(60_000),
      ]);
      signal.throwIfAborted();
      const response = StudioEvalJudgeResponseSchema.parse(
        await readJson(
          await fetch(endpoint, {
            method: "POST",
            headers: {
              authorization: `Bearer ${options.apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(request),
            redirect: "error",
            signal,
          }),
          signal,
        ),
      );
      if (
        response.judge.id !== identity.id ||
        response.judge.version !== identity.version ||
        response.judge.location !== "studio" ||
        (identity.instructions !== undefined &&
          response.judge.instructions !== identity.instructions)
      )
        throw new Error(
          "Studio judge identity changed. Refresh before running.",
        );
      if (response.request) input.onRequest?.(response.request);
      for (const usage of response.usage ?? []) input.onUsage?.(usage);
      return response.verdict;
    },
  };
}
