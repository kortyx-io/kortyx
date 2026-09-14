import { collectStream, PersistenceError, readStream } from "kortyx";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  googleResponse,
  providerFailure,
} from "../../../test/support/google-http";
import { POST as checkpoint } from "../src/app/api/chat/checkpoints/route";
import { POST as chat } from "../src/app/api/chat/route";
import { agent } from "../src/lib/kortyx-client";

vi.mock("@/lib/telemetry", () => ({ telemetry: undefined }));
beforeEach(() => {
  vi.stubEnv("GOOGLE_API_KEY", "fixture");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const request = (body: unknown) =>
  new Request("http://local/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
const command = (stream: boolean, workflowId = "general-chat") => ({
  sessionId: crypto.randomUUID(),
  workflowId,
  stream,
  messages: [{ role: "user", content: "Hello" }],
});

for (const stream of [true, false]) {
  it(`preserves successful ${stream ? "SSE" : "buffered"} response shapes`, async () => {
    const fetch = vi.fn(async () => googleResponse("Route success."));
    vi.stubGlobal("fetch", fetch);
    const response = await chat(request(command(stream)));
    expect(response.status).toBe(200);
    const result = stream
      ? await collectStream(readStream(response.body))
      : await response.json();
    expect(JSON.stringify(result)).toContain("Route success.");
    if (!stream)
      expect(result).toMatchObject({
        chunks: expect.any(Array),
        text: expect.any(String),
        structured: expect.any(Array),
      });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([
    408, 429, 503, 400, 401, 403,
  ])(`preserves provider HTTP %i through stream=${stream}`, async (status) => {
    const fetch = vi.fn(async () => providerFailure(status));
    vi.stubGlobal("fetch", fetch);
    const response = await chat(request(command(stream)));
    // Accepted execution failures remain in the envelope after headers are committed.
    expect(response.status).toBe(200);
    const chunks = stream
      ? await collectStream(readStream(response.body))
      : (await response.json()).chunks;
    expect(
      chunks.find((chunk: { type: string }) => chunk.type === "error"),
    ).toMatchObject({
      failure: {
        code: "PROVIDER_HTTP_ERROR",
        status,
        retryable: [408, 429, 503].includes(status),
        retryAfterMs: 2000,
      },
    });
    expect(JSON.stringify(chunks)).not.toContain(
      "DO_NOT_EXPORT_PROVIDER_SECRET",
    );
    expect(
      chunks.filter((chunk: { type: string }) => chunk.type === "done"),
    ).toHaveLength(1);
    expect(fetch).toHaveBeenCalledOnce();
  });
}
it.each([
  null,
  [],
  "text",
  4,
])("rejects non-object JSON commands: %j", async (body) => {
  expect((await chat(request(body))).status).toBe(400);
});
it("distinguishes preflight request failures from accepted execution failures", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(agent, "streamChat").mockRejectedValueOnce(
    new PersistenceError("private connection details"),
  );
  const response = await chat(request(command(true)));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    failure: { code: "PERSISTENCE_ERROR" },
  });
  expect(fetch).not.toHaveBeenCalled();
  const missing = await checkpoint(
    request({ action: "get", checkpointId: "missing" }),
  );
  // Read-only lookup keeps its existing null result contract.
  expect(missing.status).toBe(200);
  expect(await missing.json()).toBeNull();
  const rollback = await checkpoint(
    request({ action: "rollback", checkpointId: "missing" }),
  );
  expect(rollback.status).toBe(404);
  expect(await rollback.json()).toMatchObject({
    failure: { code: "NOT_FOUND" },
  });
});
it("preserves structured failure issues/usage without a hidden correction call", async () => {
  const fetch = vi.fn(async () => googleResponse('{"draft":{"subject":5}}'));
  vi.stubGlobal("fetch", fetch);
  const response = await chat(
    request(command(false, "reason-structured-stream")),
  );
  const { chunks } = await response.json();
  expect(
    chunks.find((chunk: { type: string }) => chunk.type === "error"),
  ).toMatchObject({
    failure: {
      code: "MODEL_OUTPUT_SCHEMA",
      issues: expect.any(Array),
      usage: { total: 5 },
    },
  });
  expect(fetch).toHaveBeenCalledOnce();
});
