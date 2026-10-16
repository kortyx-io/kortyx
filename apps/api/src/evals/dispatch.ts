import { createHash } from "node:crypto";
import type { EvalIssue, EvalWireEvent } from "@kortyx/agent/evals";
import { getUsageTelemetry } from "@kortyx/usage-telemetry/node";
import { readEvalErrorResponse } from "./error-response";
import { type EvalTarget, readEvalWire } from "./targets";

export class EvalDispatchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly issue?: Pick<
      EvalIssue,
      "failure" | "diagnosticId" | "exception"
    >,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "EvalDispatchError";
  }
}
export function evalExecutionIdentity(
  runId: string,
  caseId = "suite",
  repetition = 1,
) {
  const hex = createHash("sha256")
    .update(JSON.stringify([runId, caseId, repetition]))
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function retryAfterMs(
  value: string | null,
  now = Date.now(),
): number | undefined {
  if (!value) return undefined;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value) && !/^\d+$/.test(value))
    return undefined;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds <= 86_400
      ? seconds * 1000
      : undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : undefined;
}
export function waitForDispatch(
  ms: number,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
type State = {
  status: "queued" | "retrying" | "reconnecting";
  retryAt?: string;
  httpStatus?: number;
  executionId?: string;
  generation?: string;
};
type Admission = {
  response: Response;
  headers: Record<string, string>;
  generation: string | undefined;
  executionId: string;
  target: EvalTarget;
  request: typeof fetch;
  state: (state: State) => Promise<void>;
  cancelled: () => boolean;
  signal: AbortSignal;
};
const usage = getUsageTelemetry("eval-dispatch", "0.1.0", "oss_studio");

/** Retries admission with one identity, then reattaches by cursor. Never replay a legacy stream. */
export function createEvalDispatcher(
  request: typeof fetch = fetch,
  {
    maxRetries = 3,
    maxRetryWaitMs = 60_000,
  }: { maxRetries?: number; maxRetryWaitMs?: number } = {},
) {
  if (
    !Number.isSafeInteger(maxRetries) ||
    maxRetries < 0 ||
    !Number.isSafeInteger(maxRetryWaitMs) ||
    maxRetryWaitMs < 1
  )
    throw new TypeError("Invalid eval dispatch retry limits.");
  const capabilities = new Map<
    string,
    { expires: number; pending: Promise<string | undefined> }
  >();
  const capabilityKey = (target: EvalTarget) =>
    createHash("sha256")
      .update(JSON.stringify([target.url, target.serviceKey]))
      .digest("hex");
  const capability = async (target: EvalTarget, signal: AbortSignal) => {
    const identity = capabilityKey(target);
    let cached = capabilities.get(identity);
    if (!cached || cached.expires <= Date.now()) {
      const pending = (async () => {
        const discoverySignal = AbortSignal.timeout(30_000);
        for (let attempt = 0; ; attempt++) {
          let response: Response;
          try {
            response = await request(target.url, {
              headers: { authorization: `Bearer ${target.serviceKey}` },
              signal: discoverySignal,
              redirect: "error",
            });
          } catch (error) {
            if (attempt >= maxRetries)
              throw new EvalDispatchError(
                "EVAL_DISCOVERY_REJECTED",
                "Consumer discovery could not connect.",
                undefined,
                undefined,
                error,
              );
            await delay(
              attempt,
              undefined,
              discoverySignal,
              async () => {},
              "retrying",
            );
            continue;
          }
          if ([429, 503].includes(response.status) && attempt < maxRetries) {
            await delay(
              attempt,
              response,
              discoverySignal,
              async () => {},
              "retrying",
            );
            continue;
          }
          const generation =
            response.ok &&
            response.headers.get("x-kortyx-eval-protocol") === "jobs-v1"
              ? (response.headers.get("x-kortyx-eval-generation") ?? undefined)
              : undefined;
          if (!response.ok) {
            const body = await readEvalErrorResponse(response);
            throw new EvalDispatchError(
              "EVAL_DISCOVERY_REJECTED",
              `Consumer discovery returned HTTP ${response.status}${body ? `: ${body}` : "."}`,
              response.status,
            );
          }
          await response.body?.cancel().catch(() => {});
          if (
            (response.headers.get("x-kortyx-eval-protocol") === "jobs-v1" &&
              !generation) ||
            (generation &&
              !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(
                generation,
              ))
          )
            throw new EvalDispatchError(
              "EVAL_RESULT_INVALID",
              "Consumer returned an invalid execution storage identity.",
            );
          return generation;
        }
      })();
      cached = { expires: Date.now() + 30_000, pending };
      capabilities.set(identity, cached);
      void pending.catch(() => capabilities.delete(identity));
    }
    // A cancelled sibling must not abort shared capability discovery.
    return new Promise<string | undefined>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      cached.pending
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
    });
  };
  const cancel = async (
    admission: Pick<Admission, "target" | "executionId" | "headers">,
  ) => {
    const url = new URL(admission.target.url);
    url.searchParams.set("executionId", admission.executionId);
    const response = await request(url, {
      method: "DELETE",
      headers: admission.headers,
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    }).catch(() => undefined);
    await response?.body?.cancel().catch(() => {});
  };
  const delay = async (
    attempt: number,
    response: Response | undefined,
    signal: AbortSignal,
    state: (state: State) => Promise<void>,
    status: State["status"],
  ) => {
    const base =
      retryAfterMs(response?.headers.get("retry-after") ?? null) ??
      Math.min(500 * 2 ** attempt, 5000);
    await response?.body?.cancel().catch(() => {});
    if (base > maxRetryWaitMs)
      throw new EvalDispatchError(
        "EVAL_RETRY_DELAY_EXCEEDED",
        "Consumer requested a retry delay beyond the configured wait budget.",
        response?.status,
      );
    const ms = base + Math.floor(Math.random() * Math.min(250, base + 1));
    await state({
      status,
      retryAt: new Date(Date.now() + ms).toISOString(),
      ...(response ? { httpStatus: response.status } : {}),
    });
    usage.feature("studio.eval", {
      action: "retry",
      phase: status === "reconnecting" ? "network" : "admission",
    });
    await waitForDispatch(ms, signal);
  };
  const busy = async (response: Response) => {
    if (![429, 503].includes(response.status)) return false;
    // Only an authoritative refusal may be replayed without idempotent job negotiation.
    const reader = response.body?.getReader();
    if (!reader) return false;
    let text = "";
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        text += decoder.decode(part.value, { stream: true });
        if (text.length > 8192) return false;
      }
      const body = JSON.parse(text);
      return body?.accepted === false;
    } catch {
      return false;
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
  return {
    async open(
      target: EvalTarget,
      body: string,
      signal: AbortSignal,
      executionId: string,
      submittedAt: string,
      state: (state: State) => Promise<void>,
      cancelled: () => boolean = () => false,
      originalGeneration?: string,
    ): Promise<Admission> {
      const generation = await capability(target, signal);
      if (originalGeneration && generation !== originalGeneration)
        throw new EvalDispatchError(
          "EVAL_EXECUTION_UNKNOWN",
          "Consumer storage changed after the original admission. Inspect before running again.",
        );
      const headers: Record<string, string> = {
        authorization: `Bearer ${target.serviceKey}`,
        "content-type": "application/json",
        ...(generation
          ? {
              "x-kortyx-eval-protocol": "jobs-v1",
              "x-kortyx-eval-generation": generation,
              "idempotency-key": executionId,
              "x-kortyx-eval-submitted-at": submittedAt,
            }
          : {}),
      };
      if (originalGeneration) {
        const url = new URL(target.url);
        url.searchParams.set("executionId", executionId);
        url.searchParams.set("after", "0");
        let recovered: Response;
        try {
          recovered = await request(url, {
            headers,
            signal,
            redirect: "error",
          });
        } catch (error) {
          signal.throwIfAborted();
          throw new EvalDispatchError(
            "EVAL_EXECUTION_UNKNOWN",
            "Previously admitted execution could not be observed. Inspect before running again.",
            undefined,
            undefined,
            error,
          );
        }
        if (recovered.ok)
          return {
            response: recovered,
            headers,
            generation,
            executionId,
            target,
            request,
            state,
            cancelled,
            signal,
          };
        const status = recovered.status;
        await recovered.body?.cancel().catch(() => {});
        if (status !== 410)
          throw new EvalDispatchError(
            "EVAL_EXECUTION_UNKNOWN",
            "Previously admitted execution could not be observed. Inspect before running again.",
            status,
          );
        // The original fenced receipt was persisted before POST. A missing job
        // within the submission window can be admitted safely with the same key.
      }
      await state({
        status: "queued",
        ...(generation ? { executionId, generation } : {}),
      });
      for (let attempt = 0; ; attempt++) {
        if (cancelled()) {
          if (generation) await cancel({ target, executionId, headers });
          throw new EvalDispatchError(
            "EVAL_EXECUTION_CANCELLED",
            "Evaluation dispatch was cancelled.",
          );
        }
        let response: Response;
        try {
          response = await request(target.url, {
            method: "POST",
            body,
            headers,
            signal,
            redirect: "error",
          });
        } catch (error) {
          if (signal.aborted && generation && cancelled())
            await cancel({ target, executionId, headers });
          signal.throwIfAborted();
          if (!generation || attempt >= maxRetries)
            throw new EvalDispatchError(
              "EVAL_EXECUTION_UNKNOWN",
              "Consumer connection was lost; execution status is unknown. Inspect before running again.",
              undefined,
              undefined,
              error,
            );
          await delay(attempt, undefined, signal, state, "retrying");
          continue;
        }
        if (response.ok)
          return {
            response,
            headers,
            generation,
            executionId,
            target,
            request,
            state,
            cancelled,
            signal,
          };
        const status = response.status;
        if (status === 409) capabilities.delete(capabilityKey(target));
        const retryable =
          [429, 503].includes(status) &&
          (Boolean(generation) || (await busy(response.clone())));
        if (!retryable || attempt >= maxRetries) {
          const responseText = await readEvalErrorResponse(response);
          throw new EvalDispatchError(
            retryable
              ? "EVAL_EXECUTOR_BUSY"
              : status === 401 || status === 403
                ? "EVAL_EXECUTOR_UNAUTHORIZED"
                : status === 409
                  ? "EVAL_EXECUTION_CONFLICT"
                  : "EVAL_EXECUTOR_REJECTED",
            retryable
              ? `Consumer remained busy after ${attempt + 1} dispatch attempts.`
              : `Consumer rejected evaluation execution with HTTP ${status}.${responseText ? ` ${responseText}` : ""}`,
            status,
          );
        }
        await delay(attempt, response, signal, state, "retrying");
      }
    },
    async *events(admission: Admission): AsyncGenerator<EvalWireEvent> {
      let response = admission.response;
      const jobs =
        Boolean(admission.generation) &&
        response.headers.get("x-kortyx-eval-protocol") === "jobs-v1";
      if (
        admission.generation &&
        (!jobs ||
          response.headers.get("x-kortyx-eval-generation") !==
            admission.generation ||
          response.headers.get("x-kortyx-eval-execution-id") !==
            admission.executionId)
      )
        throw new EvalDispatchError(
          "EVAL_EXECUTION_CONFLICT",
          "Consumer changed the negotiated execution identity.",
        );
      let cursor = 0;
      let cancellationSent = false;
      const cancelTimer = jobs
        ? setInterval(() => {
            if (!cancellationSent && admission.cancelled()) {
              cancellationSent = true;
              void cancel(admission);
            }
          }, 100)
        : undefined;
      let finished = false;
      try {
        for (let retry = 0; ; retry++) {
          try {
            if (retry > 0) {
              const url = new URL(admission.target.url);
              url.searchParams.set("executionId", admission.executionId);
              url.searchParams.set("after", String(cursor));
              response = await admission.request(url, {
                headers: admission.headers,
                signal: admission.signal,
                redirect: "error",
              });
              if (
                !response.ok ||
                response.headers.get("x-kortyx-eval-generation") !==
                  admission.generation
              ) {
                const status = response.status;
                await response.body?.cancel().catch(() => {});
                if (![429, 503].includes(status))
                  throw new EvalDispatchError(
                    "EVAL_EXECUTION_CONFLICT",
                    "Consumer execution could not be reattached; inspect before running again.",
                    status,
                  );
                await delay(
                  retry - 1,
                  response,
                  admission.signal,
                  admission.state,
                  "reconnecting",
                );
                continue;
              }
            }
            if (
              !response.body ||
              !response.headers
                .get("content-type")
                ?.startsWith("application/x-ndjson")
            )
              throw new EvalDispatchError(
                "EVAL_RESULT_INVALID",
                "Consumer returned an invalid execution stream.",
              );
            for await (const event of readEvalWire(
              response.body,
              admission.signal,
            )) {
              if (event.type === "execution-status") {
                if (event.state === "queued")
                  await admission.state({
                    status: "queued",
                    executionId: admission.executionId,
                    ...(admission.generation
                      ? { generation: admission.generation }
                      : {}),
                  });
                continue;
              }
              if (jobs) {
                if (!event.sequence)
                  throw new EvalDispatchError(
                    "EVAL_RESULT_INVALID",
                    "Consumer omitted the execution event cursor.",
                  );
                if (event.sequence <= cursor) continue;
                if (event.sequence !== cursor + 1)
                  throw new EvalDispatchError(
                    "EVAL_RESULT_INVALID",
                    "Consumer skipped an execution event.",
                  );
                cursor = event.sequence;
              }
              if (event.type === "result" || event.type === "error")
                finished = true;
              yield event;
            }
            if (!finished)
              throw new EvalDispatchError(
                "EVAL_EXECUTION_UNKNOWN",
                "Execution stream ended before a final result.",
              );
            break;
          } catch (error) {
            admission.signal.throwIfAborted();
            if (finished) break;
            if (
              !jobs ||
              retry >= maxRetries ||
              (error instanceof EvalDispatchError &&
                ["EVAL_RESULT_INVALID", "EVAL_EXECUTION_CONFLICT"].includes(
                  error.code,
                ))
            )
              throw new EvalDispatchError(
                "EVAL_EXECUTION_UNKNOWN",
                "Consumer observation was lost; execution status is unknown. Captured evidence was retained.",
                undefined,
                undefined,
                error,
              );
            await delay(
              retry,
              undefined,
              admission.signal,
              admission.state,
              "reconnecting",
            );
          }
        }
      } finally {
        clearInterval(cancelTimer);
        if (
          jobs &&
          admission.signal.aborted &&
          admission.cancelled() &&
          !cancellationSent
        )
          await cancel(admission);
      }
    },
  };
}
