"use client";
import { readStream } from "kortyx/browser";
import { useState } from "react";

type Pending = {
  id: string;
  runId: string;
  input: { question?: string; options: Array<{ id: string; label: string }> };
};
export default function BackgroundPage() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Ready");
  const [pending, setPending] = useState<Pending[]>([]);
  const [review, setReview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const response = await fetch("/api/background/interrupts");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to load reviews.");
    setPending(data.interrupts);
    setReview(
      data.interrupts.length
        ? "Waiting for review"
        : "No pending reviews. Background analysis may still be running.",
    );
  };
  const start = async () => {
    setBusy(true);
    setError("");
    setText("");
    setStatus("Receiving response…");
    setReview("");
    try {
      const response = await fetch("/api/background", { method: "POST" });
      if (!response.ok) throw new Error("Unable to start workflow.");
      for await (const chunk of readStream(response.body)) {
        if (chunk.type === "message") setText((text) => text + chunk.content);
        if (chunk.type === "done")
          setStatus("Response complete — connection closed");
        if (chunk.type === "error") throw new Error(chunk.message);
      }
      await refresh();
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  const resolve = async (id: string, decision: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/background/interrupts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await refresh();
      setReview(data.message ?? data.status);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8 text-slate-100">
      <header>
        <h1 className="text-2xl font-semibold">
          Finish the response, continue the work
        </h1>
        <p className="mt-2 text-slate-400">
          The chat closes first. Internal analysis then asks for a decision in
          this separate application interface. No Studio or model credentials
          are required.
        </p>
      </header>
      <section className="space-y-4 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-medium">Client response</h2>
        <button
          type="button"
          disabled={busy}
          onClick={start}
          className="rounded bg-violet-600 px-4 py-2 disabled:opacity-50"
        >
          Start example
        </button>
        <output className="block">{status}</output>
        <p>{text}</p>
      </section>
      <section className="space-y-4 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-medium">Internal review interface</h2>
        <p className="text-slate-400">
          After a moment, refresh to discover pending requests with
          agent.listInterrupts(). Answering resumes execution without reopening
          the chat.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => refresh().catch((error) => setError(String(error)))}
          className="rounded border border-slate-600 px-4 py-2"
        >
          Refresh pending reviews
        </button>
        <p>{review}</p>
        {pending.map((item) => (
          <article
            key={item.id}
            className="space-y-3 rounded border border-slate-600 p-4"
          >
            <p className="font-medium">{item.input.question}</p>
            <p className="break-all text-xs text-slate-400">
              Interrupt: {item.id}
              <br />
              Run: {item.runId}
            </p>
            <div className="flex gap-3">
              {item.input.options.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  disabled={busy}
                  onClick={() => resolve(item.id, option.id)}
                  className="rounded bg-violet-600 px-4 py-2"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
    </main>
  );
}
