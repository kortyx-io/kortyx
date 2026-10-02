import { createHash, timingSafeEqual } from "node:crypto";
import {
  EvalConfigurationError,
  EvalRemoteRunRequestSchema,
} from "./contracts";
import { getEvalSuiteRevision } from "./revision";
import type {
  EvalProgress,
  EvalRunOptions,
  EvalRunResult,
  EvalSuite,
} from "./types";

export type EvalRunner = {
  describe: () => { schemaVersion: 1; suites: readonly EvalSuite[] };
  run: (args: EvalRunOptions) => Promise<EvalRunResult>;
};

/** Mount this Web Request handler in the consumer app. Keys never enter cases. */
export function createEvalRouteHandler({
  evals,
  serviceKey,
  maxCases = 100,
  maxActiveRuns = 1,
}: {
  evals: EvalRunner;
  serviceKey: string;
  maxCases?: number;
  maxActiveRuns?: number;
}) {
  if (serviceKey.length < 32)
    throw new EvalConfigurationError(
      "Eval service keys must have at least 32 characters.",
    );
  if (
    !Number.isSafeInteger(maxCases) ||
    maxCases < 1 ||
    !Number.isSafeInteger(maxActiveRuns) ||
    maxActiveRuns < 1
  )
    throw new EvalConfigurationError(
      "Eval endpoint limits must be positive integers.",
    );
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const expected = digest(`Bearer ${serviceKey}`);
  let active = 0;
  return async (request: Request): Promise<Response> => {
    if (
      !timingSafeEqual(
        expected,
        digest(request.headers.get("authorization") ?? ""),
      )
    )
      return Response.json(
        { error: "Unauthorized eval request." },
        { status: 401 },
      );
    const manifest = evals.describe();
    if (request.method === "GET")
      return Response.json(manifest, {
        headers: { "cache-control": "no-store" },
      });
    if (request.method !== "POST")
      return Response.json({ error: "Unsupported method." }, { status: 405 });
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return Response.json({ error: "Expected JSON." }, { status: 415 });
    let body: ReturnType<typeof EvalRemoteRunRequestSchema.parse>;
    try {
      const text = await request.text();
      if (text.length > 16_384)
        return Response.json({ error: "Request too large." }, { status: 413 });
      body = EvalRemoteRunRequestSchema.parse(JSON.parse(text));
    } catch {
      return Response.json(
        { error: "Invalid eval run request." },
        { status: 400 },
      );
    }
    const suite = manifest.suites.find((item) => item.id === body.suiteId);
    if (
      !suite ||
      body.caseIds?.some((id) => !suite.cases.some((item) => item.id === id)) ||
      (body.caseIds && new Set(body.caseIds).size !== body.caseIds.length)
    )
      return Response.json(
        { error: "Unknown suite or case selection." },
        { status: 400 },
      );
    if (getEvalSuiteRevision(suite) !== body.suiteRevision)
      return Response.json(
        { error: "Suite changed. Refresh before running." },
        { status: 409 },
      );
    if (
      (body.caseIds?.length ?? suite.cases.length) * body.repetitions >
      maxCases
    )
      return Response.json(
        { error: "Too many case repetitions." },
        { status: 400 },
      );
    if (active >= maxActiveRuns)
      return Response.json(
        { error: "Eval executor is busy." },
        { status: 429 },
      );
    if (request.signal.aborted)
      return Response.json({ error: "Request cancelled." }, { status: 409 });
    active++;
    const controller = new AbortController();
    const requestSignal = request.signal;
    const abortRequest = () => controller.abort();
    requestSignal.addEventListener("abort", abortRequest, { once: true });
    const signal = controller.signal;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(output) {
        const send = (event: unknown) => {
          if (!signal.aborted)
            output.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        void evals
          .run({
            suiteId: body.suiteId,
            repetitions: body.repetitions,
            concurrency: body.concurrency,
            signal,
            ...(body.caseIds ? { caseIds: body.caseIds } : {}),
            onProgress: (event: EvalProgress) =>
              send({ type: "progress", event }),
          })
          .then(
            (result) => send({ type: "result", result }),
            () => send({ type: "error", message: "Eval runner failed." }),
          )
          .finally(() => {
            requestSignal.removeEventListener("abort", abortRequest);
            active--;
            if (!controller.signal.aborted) output.close();
          });
      },
      cancel() {
        controller.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      },
    });
  };
}
