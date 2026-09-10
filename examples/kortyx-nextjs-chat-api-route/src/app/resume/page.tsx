"use client";

import type { ExecutionResult, ResumeResponse } from "kortyx";
import Link from "next/link";
import { useEffect, useState } from "react";

type Suspended = Extract<ExecutionResult, { status: "suspended" }>;

export default function ResumePage() {
  const [pending, setPending] = useState<Suspended | null>(null);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem("kortyx-demo-pending");
    if (saved) {
      try {
        setPending(JSON.parse(saved));
      } catch {
        sessionStorage.removeItem("kortyx-demo-pending");
      }
    }
  }, []);

  async function resume(response: ResumeResponse) {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resume: pending.resume, response }),
      });
      const next = await res.json();
      if (!res.ok) throw new Error(next.error);
      setResult(next);
      if (next.status === "suspended") {
        setPending(next);
        sessionStorage.setItem("kortyx-demo-pending", JSON.stringify(next));
      } else {
        setPending(null);
        sessionStorage.removeItem("kortyx-demo-pending");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm font-mono text-violet-300">POST /api/resume</p>
      <h1 className="mt-3 text-3xl font-semibold">Resolve an approval</h1>
      <p className="mt-3 max-w-2xl text-slate-400">
        This page submits a structured response. Kortyx resumes the waiting
        child, continues its parent, and returns the next execution result.
      </p>
      <section className="mt-9 rounded-xl border border-slate-700 p-6">
        {pending ? (
          <>
            <h2 className="text-lg font-medium">
              {pending.interrupt.input.question}
            </h2>
            <p className="mt-3 font-mono text-xs text-slate-500">
              Run {pending.runId}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {pending.interrupt.input.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy}
                  onClick={() => resume({ type: "select", ids: [option.id] })}
                  className="rounded-lg bg-violet-500 px-5 py-2.5 text-white disabled:opacity-40"
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => resume({ type: "cancel" })}
                className="rounded-lg border border-slate-600 px-4 py-2.5 disabled:opacity-40"
              >
                Cancel execution
              </button>
            </div>
          </>
        ) : (
          <p className="text-slate-400">
            {result
              ? "This execution is finished."
              : "No approval is waiting in this browser session."}{" "}
            <Link href="/execute" className="text-violet-300 underline">
              Start an execution
            </Link>
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-red-300">
            {error}
          </p>
        )}
      </section>
      {result && (
        <section className="mt-6 rounded-xl border border-slate-700 p-6">
          <h2 className="font-medium">Parent workflow result</h2>
          <output className="mt-3 block text-violet-300">
            {result.status}
          </output>
          <pre className="mt-4 overflow-auto whitespace-pre-wrap text-sm text-slate-300">
            {JSON.stringify(
              result.status === "suspended"
                ? { status: result.status, interrupt: result.interrupt }
                : result,
              null,
              2,
            )}
          </pre>
        </section>
      )}
    </main>
  );
}
