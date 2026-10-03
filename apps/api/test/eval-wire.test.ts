import { expect, it } from "vitest";
import { readEvalWire } from "../src/evals/targets";

it("cancellation closes a stalled consumer body without waiting for another chunk", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const controller = new AbortController();
  const pending = readEvalWire(body, controller.signal).next();
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(cancelled).toBe(true);
});
it("decodes NDJSON across partial UTF-8 chunks", async () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      type: "progress",
      event: {
        type: "case-started",
        caseId: "one",
        repetition: 1,
        sessionId: "évaluation",
      },
    }) + "\n",
  );
  const body = new ReadableStream<Uint8Array>({
    start(output) {
      for (const byte of bytes) output.enqueue(Uint8Array.of(byte));
      output.close();
    },
  });
  const events = [];
  for await (const event of readEvalWire(body)) events.push(event);
  expect(events).toEqual([
    {
      type: "progress",
      event: {
        type: "case-started",
        caseId: "one",
        repetition: 1,
        sessionId: "évaluation",
      },
    },
  ]);
});
