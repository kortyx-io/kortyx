"use client";
import type { EvalCaseResult, EvalStepResult } from "@kortyx/agent/evals";
import { FlaskConical, Play, RefreshCw, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type EvalDetail,
  EvalDetailSchema,
  type EvalHistory,
  EvalHistorySchema,
  type EvalTargets,
  EvalTargetsResponseSchema,
} from "../schema";

async function request(path: string, body?: unknown) {
  const response = await fetch(`/api/studio/evals/${path}`, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json", "x-kortyx-eval": "1" },
          body: JSON.stringify(body),
        }),
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Eval request failed.");
  return json;
}
const busy = (status?: string) => status === "queued" || status === "running";
function Status({ value }: { value: string }) {
  const color =
    value === "passed"
      ? "text-emerald-600 bg-emerald-500/10"
      : value === "failed" || value === "error"
        ? "text-red-600 bg-red-500/10"
        : "text-muted-foreground bg-muted";
  return (
    <span
      className={`rounded px-2 py-1 text-xs font-medium capitalize ${color}`}
    >
      {value}
    </span>
  );
}
function Step({ step }: { step: EvalStepResult }) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex justify-between gap-4">
        <p className="font-medium">
          Step {step.index + 1} ·{" "}
          {"message" in step.input
            ? step.input.message
            : "Respond to interrupt"}
        </p>
        <Status value={step.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        Expected {step.expectation.type}
        {step.expectation.schemaId ? ` · ${step.expectation.schemaId}` : ""} ·
        Observed {step.observation.type}
      </p>
      {step.reason ? (
        <p className="text-sm text-red-600">{step.reason}</p>
      ) : null}
      {step.observation.text ? (
        <p className="whitespace-pre-wrap text-sm">{step.observation.text}</p>
      ) : null}
      {step.observation.interrupt ? (
        <details open>
          <summary className="text-sm font-medium">Human interrupt</summary>
          <pre className="mt-2 overflow-auto rounded bg-muted p-3 text-xs">
            {JSON.stringify(step.observation.interrupt, null, 2)}
          </pre>
        </details>
      ) : null}
      {step.criteria.map((criterion) => (
        <div key={criterion.id} className="border-t pt-3 text-sm">
          <div className="flex gap-2 items-start">
            <Status value={criterion.passed ? "passed" : "failed"} />
            <span>{criterion.text}</span>
          </div>
          <p className="mt-2">{criterion.reason}</p>
          {criterion.evidence.map((text, index) => (
            <blockquote
              key={`${index}:${text}`}
              className="mt-2 border-l-2 pl-3 text-muted-foreground"
            >
              {text}
            </blockquote>
          ))}
        </div>
      ))}
      {step.reference !== undefined ? (
        <details>
          <summary className="text-sm">Reference facts</summary>
          <pre className="overflow-auto text-xs p-3">
            {JSON.stringify(step.reference, null, 2)}
          </pre>
        </details>
      ) : null}
      {step.observation.structured.length ? (
        <details>
          <summary className="text-sm">Structured output</summary>
          <pre className="overflow-auto text-xs p-3">
            {JSON.stringify(step.observation.structured, null, 2)}
          </pre>
        </details>
      ) : null}
      {step.observation.runId ? (
        <Link
          className="text-xs underline"
          href={`/runs/${encodeURIComponent(step.observation.runId)}`}
        >
          Inspect workflow run
        </Link>
      ) : null}
    </div>
  );
}
export function EvalsPageClient({
  initialTargets,
  initialHistory,
  initialDetail,
}: {
  initialTargets: EvalTargets;
  initialHistory: EvalHistory;
  initialDetail: EvalDetail | null;
}) {
  const [targets, setTargets] = useState(initialTargets);
  const [history, setHistory] = useState(initialHistory);
  const [detail, setDetail] = useState(initialDetail);
  const [targetId, setTargetId] = useState(initialTargets.targets[0]?.id ?? "");
  const [suiteId, setSuiteId] = useState(
    initialTargets.targets[0]?.manifest?.suites[0]?.id ?? "",
  );
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [repetitions, setRepetitions] = useState(1);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const target = targets.targets.find((item) => item.id === targetId);
  const suite = target?.manifest?.suites.find((item) => item.id === suiteId);
  const selectedId = detail?.id;
  useEffect(() => {
    if (!selectedId || !busy(detail?.status)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [next, list] = await Promise.all([
          request(`runs/${selectedId}`),
          request("runs"),
        ]);
        if (stopped) return;
        const parsed = EvalDetailSchema.parse(next).run;
        setDetail(parsed);
        setHistory(EvalHistorySchema.parse(list));
        if (busy(parsed.status)) timer = setTimeout(poll, 1500);
      } catch {
        if (!stopped) {
          setError(
            "Progress connection lost. The run remains recorded; refresh to reconnect.",
          );
          timer = setTimeout(poll, 4000);
        }
      }
    };
    timer = setTimeout(poll, 500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [selectedId, detail?.status]);
  const selectRun = async (id: string) => {
    setError("");
    try {
      setDetail(EvalDetailSchema.parse(await request(`runs/${id}`)).run);
      window.history.replaceState(null, "", `/evals?run=${id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load run.");
    }
  };
  const run = async () => {
    if (!suite || !target) return;
    setWorking(true);
    setError("");
    try {
      const saved = await request("runs", {
        targetId,
        suiteId,
        suiteRevision: target.revisions[suiteId],
        repetitions,
        concurrency: 1,
        ...(caseIds.length ? { caseIds } : {}),
      });
      await selectRun(saved.id);
      setHistory(EvalHistorySchema.parse(await request("runs")));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start eval.",
      );
    } finally {
      setWorking(false);
    }
  };
  const refresh = async () => {
    setWorking(true);
    setError("");
    try {
      const [next, list] = await Promise.all([
        request("targets"),
        request("runs"),
      ]);
      setTargets(EvalTargetsResponseSchema.parse(next));
      setHistory(EvalHistorySchema.parse(list));
      if (selectedId) await selectRun(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh.");
    } finally {
      setWorking(false);
    }
  };
  const cases = new Map<string, EvalCaseResult>();
  for (const { event } of detail?.events ?? []) {
    if (event.type === "case-started")
      cases.set(`${event.caseId}:${event.repetition}`, {
        caseId: event.caseId,
        repetition: event.repetition,
        sessionId: event.sessionId,
        status: "passed",
        durationMs: 0,
        steps: [],
        errors: [],
      });
    if (event.type === "step-completed") {
      const item = cases.get(`${event.caseId}:${event.repetition}`);
      if (item) item.steps.push(event.step);
    }
    if (event.type === "case-completed")
      cases.set(
        `${event.result.caseId}:${event.result.repetition}`,
        event.result,
      );
  }
  const results = detail?.result?.cases ?? [...cases.values()];
  return (
    <div className="max-w-7xl p-6 lg:p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex gap-2 items-center">
            <FlaskConical className="size-6" />
            Evals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Run conversations against your application and inspect their
            outcomes.
          </p>
        </div>
        <Button variant="outline" disabled={working} onClick={refresh}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </header>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-500/30 p-3 text-sm text-red-600"
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-5">
          <section className="rounded-xl border p-4 space-y-4">
            <h2 className="font-semibold">Run a suite</h2>
            {targets.targets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No eval applications are connected. Configure an eval target on
                the Studio API server.
              </p>
            ) : (
              <>
                <label className="block text-sm">
                  Application
                  <select
                    aria-label="Application"
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={targetId}
                    onChange={(event) => {
                      const next = targets.targets.find(
                        (item) => item.id === event.target.value,
                      );
                      setTargetId(event.target.value);
                      setSuiteId(next?.manifest?.suites[0]?.id ?? "");
                      setCaseIds([]);
                    }}
                  >
                    {targets.targets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.environment}
                      </option>
                    ))}
                  </select>
                </label>
                {target?.error ? (
                  <p className="text-sm text-red-600">{target.error}</p>
                ) : null}
                <label className="block text-sm">
                  Suite
                  <select
                    aria-label="Suite"
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={suiteId}
                    onChange={(event) => {
                      setSuiteId(event.target.value);
                      setCaseIds([]);
                    }}
                  >
                    {target?.manifest?.suites.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name ?? item.id}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm">
                    Cases · leave unchecked to run all
                  </legend>
                  {suite?.cases.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={caseIds.includes(item.id)}
                        onChange={(event) =>
                          setCaseIds((current) =>
                            event.target.checked
                              ? [...current, item.id]
                              : current.filter((id) => id !== item.id),
                          )
                        }
                      />
                      {item.name ?? item.id}
                    </label>
                  ))}
                </fieldset>
                <label className="block text-sm">
                  Repetitions
                  <input
                    aria-label="Repetitions"
                    type="number"
                    min={1}
                    max={20}
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={repetitions}
                    onChange={(event) =>
                      setRepetitions(Number(event.target.value))
                    }
                  />
                </label>
                <Button
                  className="w-full"
                  disabled={
                    !targets.canRun ||
                    !suite ||
                    working ||
                    repetitions < 1 ||
                    repetitions > 20 ||
                    !Number.isInteger(repetitions)
                  }
                  onClick={run}
                >
                  <Play className="size-4" />
                  Run suite
                </Button>
                {!targets.canRun ? (
                  <p className="text-xs text-muted-foreground">
                    Execution requires eval:run permission on the Studio key.
                  </p>
                ) : null}
              </>
            )}
          </section>
          <section className="rounded-xl border p-4">
            <h2 className="font-semibold mb-3">Run history</h2>
            {history.runs.length ? (
              <div className="space-y-2">
                {history.runs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full rounded-lg border p-3 text-left text-sm ${selectedId === item.id ? "border-primary" : "hover:bg-muted"}`}
                    onClick={() => selectRun(item.id)}
                  >
                    <div className="flex justify-between gap-2">
                      <span>{item.suiteId}</span>
                      <Status value={item.status} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.targetName} ·{" "}
                      {new Date(item.createdAt)
                        .toISOString()
                        .replace("T", " ")
                        .slice(0, 19)}{" "}
                      UTC
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No eval runs yet.</p>
            )}
          </section>
        </aside>
        <main className="min-w-0 space-y-5">
          {detail ? (
            <>
              <section className="rounded-xl border p-5">
                <div className="flex justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{detail.suiteId}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {detail.targetName} · {detail.environment}
                    </p>
                  </div>
                  <Status value={detail.status} />
                </div>
                {detail.result ? (
                  <p className="mt-4 text-sm">
                    {detail.result.counts.passed} passed ·{" "}
                    {detail.result.counts.failed} failed ·{" "}
                    {detail.result.counts.error} errors ·{" "}
                    {detail.result.counts.cancelled} cancelled
                  </p>
                ) : (
                  <p className="mt-4 text-sm">
                    {detail.cancelRequestedAt
                      ? "Cancellation requested; waiting for the executor."
                      : busy(detail.status)
                        ? "Execution in progress. You can reload this page without losing the run."
                        : "Execution ended."}
                  </p>
                )}
                {detail.result?.judge ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Grader: {detail.result.judge.id} ·{" "}
                    {detail.result.judge.version}
                  </p>
                ) : null}
                {detail.error ? (
                  <p className="mt-3 text-sm text-red-600">{detail.error}</p>
                ) : null}
                {busy(detail.status) ? (
                  <Button
                    variant="outline"
                    className="mt-4"
                    disabled={Boolean(detail.cancelRequestedAt)}
                    onClick={async () => {
                      try {
                        await request(`runs/${detail.id}/cancel`, {});
                        await selectRun(detail.id);
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Cancellation failed.",
                        );
                      }
                    }}
                  >
                    <Square className="size-4" />
                    Cancel run
                  </Button>
                ) : null}
              </section>
              {results.map((item) => (
                <section
                  key={`${item.caseId}:${item.repetition}`}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">
                      {item.caseId} · repetition {item.repetition}
                    </h3>
                    {detail.result ||
                    detail.events.some(
                      ({ event }) =>
                        event.type === "case-completed" &&
                        event.result.caseId === item.caseId &&
                        event.result.repetition === item.repetition,
                    ) ? (
                      <Status value={item.status} />
                    ) : (
                      <Status value="running" />
                    )}
                  </div>
                  {item.steps.map((step) => (
                    <Step key={step.index} step={step} />
                  ))}
                  {item.errors.map((issue, index) => (
                    <p
                      role="alert"
                      key={`${index}:${issue.code}`}
                      className="text-sm text-red-600"
                    >
                      {issue.phase}: {issue.message}
                    </p>
                  ))}
                </section>
              ))}
              {detail.result?.errors.map((issue, index) => (
                <p
                  role="alert"
                  key={`${index}:${issue.code}`}
                  className="text-sm text-red-600"
                >
                  {issue.phase}: {issue.message}
                </p>
              ))}
            </>
          ) : (
            <section className="rounded-xl border p-8 text-sm text-muted-foreground">
              Select a previous run or start a suite to inspect prompts,
              interrupts, answers, and verdicts.
            </section>
          )}
          {suite ? (
            <details className="rounded-xl border p-4">
              <summary className="text-sm font-medium">
                Suite definition
              </summary>
              <pre className="mt-3 overflow-auto text-xs">
                {JSON.stringify(suite, null, 2)}
              </pre>
            </details>
          ) : null}
        </main>
      </div>
    </div>
  );
}
