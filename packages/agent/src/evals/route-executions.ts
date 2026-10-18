import { createHash, randomUUID } from "node:crypto";
import {
  isControlFlowError,
  KortyxError,
  serializeFailure,
} from "@kortyx/core/errors";
import type {
  EvalExecutionJob,
  EvalExecutionLimits,
  EvalExecutionStore,
} from "@kortyx/runtime";
import {
  type EvalRemoteRunRequest,
  EvalRemoteRunRequestSchema,
} from "./contracts";
import { createEvalIssue } from "./errors";
import { getEvalSuiteRevision } from "./revision";
import type { EvalRunner } from "./route-handler";

const protocol = "jobs-v1";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
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
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  return JSON.stringify(value) as string;
};

type EvalExecutionTransport = {
  existing(request: Request): Promise<Response | undefined>;
  submit(request: Request, body: EvalRemoteRunRequest): Promise<Response>;
  capabilityHeaders(): Promise<Record<string, string>>;
  drain(): Promise<void>;
  close(): Promise<void>;
};

/** Execution belongs to a fenced job; request connections only observe it. */
export function createEvalExecutionTransport({
  evals,
  store,
  scope,
  limits,
  onExecution,
}: {
  evals: EvalRunner;
  store: EvalExecutionStore;
  scope: string;
  limits: EvalExecutionLimits;
  onExecution?: (completion: Promise<void>) => void;
}): EvalExecutionTransport {
  const owner = randomUUID();
  const active = new Map<
    string,
    { controller: AbortController; completion: Promise<void> }
  >();
  let ticking: Promise<void> | undefined;
  let draining = false;
  let stopped = false;
  let drain: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let retirementFailure: Error | undefined;
  const unsupportedRetirement = new Error(
    "Execution store requires queued and claimQueued for graceful retirement.",
  );
  const admissions = new Set<Promise<void>>();
  const heartbeats = new Set<Promise<unknown>>();
  const failedRetirement = () => {
    retirementFailure ??= new Error(
      "Consumer evaluation retirement could not be confirmed.",
    );
  };
  const finish = async (id: string, state: "completed" | "cancelled") => {
    try {
      await store.finish(id, owner, state);
      if ((await store.status(id))?.state !== state)
        throw new Error("Consumer completion was not confirmed.");
    } catch (error) {
      failedRetirement();
      throw error;
    }
  };
  const key = (id: string) =>
    createHash("sha256").update(`${scope}\0${id}`).digest("hex");
  const fail = async (job: EvalExecutionJob, error: unknown) => {
    const issue = createEvalIssue("reporting", error);
    await store.append(job.id, owner, {
      type: "error",
      message: issue.message,
      exception: issue.exception,
      failure: issue.failure,
      ...(issue.diagnosticId ? { diagnosticId: issue.diagnosticId } : {}),
    });
  };
  const run = async (job: EvalExecutionJob, controller: AbortController) => {
    let renewing = false;
    const timer = setInterval(() => {
      if (renewing) return;
      renewing = true;
      const pending = Promise.resolve().then(() =>
        store.heartbeat(job.id, owner),
      );
      heartbeats.add(pending);
      void pending
        .then(
          (current) => {
            if (!current) controller.abort("lease-lost");
            else if (current.cancelRequested)
              controller.abort("user-cancelled");
          },
          () => controller.abort("lease-lost"),
        )
        .finally(() => {
          heartbeats.delete(pending);
          renewing = false;
        });
    }, store.heartbeatIntervalMs);
    const deadline = setTimeout(
      () => controller.abort("execution-timeout"),
      30 * 60_000,
    );
    try {
      const body = EvalRemoteRunRequestSchema.parse(job.payload);
      const current = evals
        .describe()
        .suites.find((suite) => suite.id === body.suiteId);
      if (!current || getEvalSuiteRevision(current) !== body.suiteRevision)
        throw new KortyxError(
          "EVAL_CONTRACT_CHANGED",
          "The queued suite changed before execution.",
          {
            category: "configuration",
            retryable: false,
            safeMessage: "The queued suite changed before execution.",
          },
        );
      const result = await evals.run({
        suiteId: body.suiteId,
        repetitions: body.repetitions,
        concurrency: body.concurrency,
        ...(body.caseTimeoutMs !== undefined
          ? { caseTimeoutMs: body.caseTimeoutMs }
          : {}),
        signal: controller.signal,
        ...(body.attempt ? { attempt: body.attempt } : {}),
        ...(body.caseIds ? { caseIds: body.caseIds } : {}),
        ...(body.grading ? { grading: body.grading } : {}),
        ...(body.judge ? { judgeIdentity: body.judge } : {}),
        ...(body.promptSnapshot ? { promptSnapshot: body.promptSnapshot } : {}),
        onProgress: (event) =>
          store.append(job.id, owner, { type: "progress", event }),
      });
      await store.append(job.id, owner, { type: "result", result });
      await finish(
        job.id,
        result.status === "cancelled" ? "cancelled" : "completed",
      );
    } catch (error) {
      try {
        if (
          controller.signal.reason === "user-cancelled" &&
          isControlFlowError(error)
        )
          error = new KortyxError(
            "EVAL_EXECUTION_CANCELLED",
            "Evaluation execution was cancelled.",
            {
              category: "request",
              status: 409,
              retryable: false,
              safeMessage: "Evaluation execution was cancelled.",
            },
          );
        await fail(job, error);
        await finish(
          job.id,
          controller.signal.reason === "user-cancelled"
            ? "cancelled"
            : "completed",
        );
      } catch {
        failedRetirement();
        /* A lost lease remains unknown; another owner must never replay this job. */
      }
    } finally {
      clearInterval(timer);
      clearTimeout(deadline);
      active.delete(job.id);
    }
  };
  const tick = (selected?: readonly string[]): Promise<void> => {
    // Requests must keep polling cancellation while another claim is in flight.
    // Retirement/close explicitly await ticking before releasing dependencies.
    if (ticking) return Promise.resolve();
    if (stopped || (draining && !selected)) return Promise.resolve();
    // Install the promise before invoking adapters, which may throw synchronously.
    ticking = Promise.resolve().then(async () => {
      try {
        while (!stopped && (!draining || selected)) {
          const job = selected
            ? await store.claimQueued!(owner, scope, limits, selected)
            : await store.claim(owner, scope, limits);
          if (!job) break;
          // A late claim belongs to us during drain, but explicit close must not
          // dispatch new side effects after the abort snapshot.
          if (stopped) break;
          const controller = new AbortController();
          const completion = run(job, controller);
          active.set(job.id, { controller, completion });
          try {
            onExecution?.(completion);
          } catch {
            /* Optional host integration must not change execution. */
          }
        }
      } catch {
        failedRetirement();
        /* Store availability is also reported by authenticated admission/observation. */
      } finally {
        ticking = undefined;
      }
    });
    return ticking;
  };
  const timer = setInterval(() => {
    void tick();
  }, 250);
  timer.unref?.();
  void tick();
  const headers = async (id: string) => ({
    "content-type": "application/x-ndjson",
    "cache-control": "no-store",
    "x-accel-buffering": "no",
    "x-kortyx-eval-protocol": protocol,
    "x-kortyx-eval-execution-id": id,
    "x-kortyx-eval-generation": await store.generation(),
  });
  const problem = (error: unknown, negotiated: boolean) => {
    const issue = createEvalIssue("reporting", error);
    const failure = serializeFailure(error);
    const busy = failure.code === "EVAL_EXECUTOR_BUSY";
    return Response.json(
      {
        error: issue.message,
        issue,
        failure,
        ...(busy ? { accepted: false } : {}),
      },
      {
        status: busy
          ? negotiated
            ? 503
            : 429
          : !negotiated && failure.code === "EVAL_CONCURRENCY_CHANGED"
            ? 429
            : (failure.status ?? 503),
        headers: {
          ...(negotiated ? { "x-kortyx-eval-protocol": protocol } : {}),
          ...(busy ? { "retry-after": "2" } : {}),
        },
      },
    );
  };
  const observe = async (
    request: Request,
    id: string,
    after = 0,
    negotiated = true,
  ) => {
    const backend = key(id);
    const job = await store.status(backend);
    if (!job)
      return Response.json(
        {
          error: "Evaluation execution is unavailable; do not replay it.",
          code: "EVAL_EXECUTION_UNKNOWN",
        },
        { status: 410 },
      );
    if (after > job.sequence)
      return Response.json(
        { error: "Invalid execution event cursor." },
        { status: 409 },
      );
    const controller = new AbortController();
    const disconnect = () => {
      controller.abort();
      if (!negotiated) {
        active.get(backend)?.controller.abort("user-cancelled");
        void store.cancel(backend).catch(() => {});
      }
    };
    request.signal.addEventListener("abort", disconnect, { once: true });
    if (request.signal.aborted) disconnect();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(output) {
        void (async () => {
          let cursor = after;
          let state: string | undefined;
          try {
            while (!controller.signal.aborted) {
              const record = await store.status(backend);
              if (!record) throw new Error("Execution record expired.");
              if (negotiated && state !== record.state) {
                state = record.state;
                output.enqueue(
                  encoder.encode(
                    `${JSON.stringify({ type: "execution-status", state })}\n`,
                  ),
                );
              }
              for (const item of await store.events(backend, cursor)) {
                if (controller.signal.aborted) break;
                output.enqueue(
                  encoder.encode(
                    `${JSON.stringify({ ...item.event, ...(negotiated ? { sequence: item.sequence } : {}) })}\n`,
                  ),
                );
                cursor = item.sequence;
              }
              if (
                record.state !== "queued" &&
                record.state !== "running" &&
                cursor >= record.sequence
              )
                break;
              await wait(100, controller.signal);
            }
            if (!controller.signal.aborted) output.close();
          } catch (error) {
            if (!controller.signal.aborted) output.error(error);
          } finally {
            if (controller.signal.aborted) {
              try {
                output.close();
              } catch {
                /* The reader may already have cancelled. */
              }
            }
            request.signal.removeEventListener("abort", disconnect);
          }
        })();
      },
      cancel() {
        disconnect();
      },
    });
    return new Response(stream, { headers: await headers(id) });
  };
  return {
    async existing(request: Request): Promise<Response | undefined> {
      const url = new URL(request.url);
      const id = url.searchParams.get("executionId");
      if (!id) return undefined;
      if (!uuid.test(id))
        return Response.json(
          { error: "Invalid execution identity." },
          { status: 400 },
        );
      try {
        const generation = request.headers.get("x-kortyx-eval-generation");
        if (generation && generation !== (await store.generation()))
          return Response.json(
            {
              error: "Execution storage changed; execution status is unknown.",
              code: "EVAL_EXECUTION_STORE_CHANGED",
            },
            { status: 409 },
          );
        if (request.method === "DELETE") {
          if (!(await store.status(key(id))))
            return Response.json(
              { error: "Unknown execution." },
              { status: 404 },
            );
          await store.cancel(key(id));
          active.get(key(id))?.controller.abort("user-cancelled");
          return Response.json({ cancelRequested: true });
        }
        if (request.method !== "GET")
          return Response.json(
            { error: "Unsupported observation method." },
            { status: 405 },
          );
        const raw = url.searchParams.get("after") ?? "0";
        if (!/^\d{1,8}$/.test(raw))
          return Response.json(
            { error: "Invalid execution event cursor." },
            { status: 400 },
          );
        return await observe(request, id, Number(raw));
      } catch (error) {
        return problem(error, true);
      }
    },
    async submit(request: Request, body: EvalRemoteRunRequest) {
      const negotiated =
        request.headers.get("x-kortyx-eval-protocol") === protocol;
      const retiring = draining;
      const refused = () =>
        problem(
          new KortyxError(
            "EVAL_EXECUTOR_BUSY",
            "Eval executor is draining; execution was not accepted.",
            {
              category: "request",
              status: 503,
              retryable: true,
              safeMessage:
                "Eval executor is draining; execution was not accepted.",
            },
          ),
          negotiated,
        );
      if (stopped || (retiring && !negotiated)) return refused();
      const id = negotiated
        ? request.headers.get("idempotency-key")
        : randomUUID();
      if (!id || !uuid.test(id))
        return Response.json(
          { error: "A UUID execution identity is required." },
          { status: 400 },
        );
      const submitted = request.headers.get("x-kortyx-eval-submitted-at");
      if (
        negotiated &&
        (!submitted ||
          !Number.isFinite(Date.parse(submitted)) ||
          Date.parse(submitted) < Date.now() - 86_400_000 ||
          Date.parse(submitted) > Date.now() + 300_000)
      )
        return Response.json(
          {
            error:
              "Execution submission window expired; inspect before starting another execution.",
          },
          { status: 410 },
        );
      const fingerprint = createHash("sha256")
        .update(canonical(body))
        .digest("hex");
      try {
        let admitted!: () => void;
        const pending = new Promise<void>((resolve) => {
          admitted = resolve;
        });
        admissions.add(pending);
        try {
          if (
            negotiated &&
            request.headers.get("x-kortyx-eval-generation") !==
              (await store.generation())
          )
            return Response.json(
              {
                error:
                  "Execution storage changed; execution status is unknown.",
                code: "EVAL_EXECUTION_STORE_CHANGED",
              },
              { status: 409 },
            );
          if (retiring) {
            // A lost POST response can be retried after preparation begins.
            // Reattach existing evidence without admitting or replaying work.
            const existing = await store.get(key(id));
            if (!existing) return refused();
            if (existing.fingerprint !== fingerprint)
              throw new KortyxError(
                "EVAL_EXECUTION_CONFLICT",
                "Execution identity was reused with a different request.",
                {
                  category: "request",
                  status: 409,
                  retryable: false,
                  safeMessage:
                    "Execution identity was reused with a different request.",
                },
              );
            return await observe(request, id);
          }
          try {
            await store.submit(
              {
                id: key(id),
                scope,
                fingerprint,
                group: key(body.attempt?.evaluationId ?? id),
                concurrency: body.concurrency,
                weight: body.attempt ? 1 : body.concurrency,
                payload: body,
                queued: negotiated,
              },
              limits,
            );
          } catch (error) {
            if (
              !(error instanceof KortyxError) ||
              ![
                "EVAL_EXECUTOR_BUSY",
                "EVAL_EXECUTION_CONFLICT",
                "EVAL_CONCURRENCY_UNSUPPORTED",
                "EVAL_CONCURRENCY_CHANGED",
                "EVAL_EVIDENCE_LIMIT",
              ].includes(error.code)
            )
              failedRetirement();
            throw error;
          }
        } finally {
          admissions.delete(pending);
          admitted();
        }
        if (stopped && !negotiated) {
          throw new Error("Consumer execution was explicitly closed.");
        }
        await tick();
        if (!negotiated) {
          // Legacy clients own the request lifetime and enter execution before
          // receiving the stream, so immediate disconnect still signals cleanup.
          while ((await store.status(key(id)))?.state === "queued") {
            if (stopped)
              throw new Error("Consumer execution was explicitly closed.");
            request.signal.throwIfAborted();
            await wait(10, request.signal);
            await tick();
          }
        }
        return await observe(request, id, 0, negotiated);
      } catch (error) {
        if (!negotiated && (request.signal.aborted || stopped)) {
          active.get(key(id))?.controller.abort("user-cancelled");
          await store.cancel(key(id)).catch(() => {});
        }
        return problem(error, negotiated);
      }
    },
    async capabilityHeaders() {
      return {
        "x-kortyx-eval-protocol": protocol,
        "x-kortyx-eval-generation": await store.generation(),
      };
    },
    drain() {
      draining = true;
      clearInterval(timer);
      drain ??= (async () => {
        try {
          await Promise.all(admissions);
          await ticking;
          if (!store.queued || !store.claimQueued) throw unsupportedRetirement;
          const selected = new Set(await store.queued(scope));
          if (selected.size > limits.maxQueuedExecutions)
            throw new Error("Retirement queue exceeds the configured bound.");
          while (!stopped) {
            if (selected.size) await tick([...selected]);
            for (const id of selected) {
              const status = await store.status(id);
              if (!status || status.state === "unknown") failedRetirement();
              if (status?.state !== "queued") selected.delete(id);
            }
            await Promise.all(
              [...active.values()].map((job) => job.completion),
            );
            if (!selected.size || retirementFailure) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          await Promise.all([...active.values()].map((job) => job.completion));
          await Promise.allSettled(heartbeats);
          if (stopped)
            throw new Error("Consumer retirement was explicitly aborted.");
          if (retirementFailure) throw retirementFailure;
        } catch (error) {
          failedRetirement();
          // Host errors never include store contents or credentials.
          throw error === unsupportedRetirement
            ? unsupportedRetirement
            : retirementFailure;
        }
      })();
      return drain;
    },
    close() {
      stopped = true;
      clearInterval(timer);
      closing ??= (async () => {
        for (const job of active.values()) job.controller.abort("host-stopped");
        await Promise.all(admissions);
        await ticking;
        await Promise.all([...active.values()].map((job) => job.completion));
        await Promise.allSettled(heartbeats);
      })();
      return closing;
    },
  };
}
