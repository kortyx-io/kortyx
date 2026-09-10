"use client";

import type { ExecutionResult } from "kortyx";
import Link from "next/link";
import { useRef, useState } from "react";

export default function ExecutePage() {
  const [brief, setBrief] = useState(
    "Create a developer onboarding guide with a working example and a short checklist.",
  );
  const [requireApproval, setRequireApproval] = useState(true);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const [stopped, setStopped] = useState(false);

  async function execute() {
    const controller = new AbortController();
    controllerRef.current = controller;
    setStopped(false);
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { brief, requireApproval, slow } }),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error);
      setResult(next);
      if (next.status === "suspended")
        sessionStorage.setItem("kortyx-demo-pending", JSON.stringify(next));
    } catch (failure) {
      if (controller.signal.aborted) setStopped(true);
      else
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      controllerRef.current = null;
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm font-mono text-violet-300">POST /api/execute</p>
      <h1 className="mt-3 text-3xl font-semibold">Execute a workflow</h1>
      <p className="mt-3 max-w-2xl text-slate-400">
        Send a brief and receive one typed result. Enable approval to pause
        inside a child workflow, then continue from the separate approval page.
      </p>
      <div className="mt-9 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-700 p-6">
          <label htmlFor="brief" className="block font-medium">
            Brief
          </label>
          <textarea
            id="brief"
            className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
            rows={6}
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
          />
          <label className="mt-4 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(event) => setRequireApproval(event.target.checked)}
            />
            Require human approval
          </label>
          <label className="mt-4 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={slow}
              onChange={(event) => setSlow(event.target.checked)}
            />
            Add a 10-second delay to try Stop
          </label>
          <button
            type="button"
            disabled={busy || !brief.trim()}
            onClick={execute}
            className="mt-6 rounded-lg bg-violet-500 px-5 py-2.5 font-medium text-white disabled:opacity-40"
          >
            {busy ? "Executing…" : "Execute workflow"}
          </button>
          {busy && (
            <button
              type="button"
              onClick={() => controllerRef.current?.abort()}
              className="ml-3 rounded-lg border border-slate-500 px-5 py-2.5"
            >
              Stop
            </button>
          )}
          {stopped && (
            <output className="mt-4 block text-amber-200">
              Request stopped. The server receives cancellation through the
              connection; no result can return over the closed request.
            </output>
          )}
          {error && (
            <p role="alert" className="mt-4 text-red-300">
              {error}
            </p>
          )}
        </section>
        <section className="rounded-xl border border-slate-700 p-6">
          <h2 className="font-medium">Execution result</h2>
          {result ? (
            <>
              <output className="mt-3 block text-violet-300">
                {result.status}
              </output>
              <pre className="mt-4 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">
                {JSON.stringify(
                  result.status === "suspended"
                    ? {
                        ...result,
                        resume: {
                          ...result.resume,
                          token: "[private resume token]",
                        },
                      }
                    : result,
                  null,
                  2,
                )}
              </pre>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Your workflow result will appear here.
            </p>
          )}
          {result?.status === "suspended" && (
            <Link
              className="mt-6 inline-block rounded-lg border border-violet-400 px-4 py-2 text-violet-200"
              href="/resume"
            >
              Open approval page →
            </Link>
          )}
        </section>
      </div>
      <p className="mt-7 text-sm text-slate-500">
        This example uses deterministic text processing and works without a
        model API key.
      </p>
    </main>
  );
}
