import { collectStream, readStream } from "kortyx";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  googleResponse,
  providerFailure,
} from "../../../../../../../test/support/google-http";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/telemetry", () => ({
  getCanvasTelemetryAdapter: () => undefined,
  flushCanvasTelemetry: async () => {},
}));
beforeEach(() => {
  vi.stubEnv("GOOGLE_API_KEY", "fixture");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const request = (stream: boolean) =>
  new Request("http://local/api/canvas-agent/chat", {
    method: "POST",
    body: JSON.stringify({
      sessionId: crypto.randomUUID(),
      stream,
      messages: [{ role: "user", content: "Hello" }],
      context: { tenantId: "untrusted" },
    }),
  });
for (const stream of [true, false]) {
  it.each([
    401, 503,
  ])(`preserves provider HTTP %i through Canvas stream=${stream}`, async (status) => {
    const fetch = vi.fn(async () => providerFailure(status));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request(stream));
    const chunks = stream
      ? await collectStream(readStream(response.body))
      : (await response.json()).chunks;
    expect(
      chunks.find((chunk: { type: string }) => chunk.type === "error"),
    ).toMatchObject({
      failure: {
        code: "PROVIDER_HTTP_ERROR",
        status,
        retryable: status === 503,
      },
    });
    expect(JSON.stringify(chunks)).not.toContain(
      "DO_NOT_EXPORT_PROVIDER_SECRET",
    );
    expect(fetch).toHaveBeenCalledOnce();
  });
}
it("keeps Canvas classifier schema failures distinct from transport failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) =>
      googleResponse(
        '{"intent":"invalid"}',
        String(_url).includes("streamGenerate"),
      ),
    ),
  );
  const result = await (await POST(request(false))).json();
  expect(
    result.chunks.find((chunk: { type: string }) => chunk.type === "error"),
  ).toMatchObject({
    failure: {
      code: "MODEL_OUTPUT_SCHEMA",
      issues: expect.any(Array),
      usage: { total: 5 },
    },
  });
});
it("preserves the successful classifier-to-chat path", async () => {
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      googleResponse(
        calls++ === 0 ? '{"intent":"general_chat"}' : "Canvas success.",
        String(url).includes("streamGenerate"),
      ),
    ),
  );
  const result = await (await POST(request(false))).json();
  expect(
    result.chunks.some((chunk: { type: string }) => chunk.type === "error"),
  ).toBe(false);
  expect(JSON.stringify(result)).toContain("Canvas success.");
  expect(calls).toBe(2);
});
