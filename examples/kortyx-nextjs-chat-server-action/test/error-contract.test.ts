import { PersistenceError } from "kortyx";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  googleResponse,
  providerFailure,
} from "../../../test/support/google-http";
import { runChat } from "../src/app/actions/chat";
import { agent } from "../src/lib/kortyx-client";

beforeEach(() => {
  vi.stubEnv("GOOGLE_API_KEY", "fixture");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const run = (workflowId = "general-chat") =>
  runChat({
    sessionId: crypto.randomUUID(),
    workflowId,
    messages: [{ role: "user", content: "Hello" }],
  });

it("returns serializable successful chunks through the real Server Action", async () => {
  const fetch = vi.fn(async () => googleResponse("Action success."));
  vi.stubGlobal("fetch", fetch);
  const chunks = await run();
  expect(chunks.some((chunk) => chunk.type === "error")).toBe(false);
  expect(JSON.stringify(chunks)).toContain("Action success.");
  expect(chunks.filter((chunk) => chunk.type === "done")).toHaveLength(1);
  expect(fetch).toHaveBeenCalledOnce();
});

it.each([
  408, 429, 503, 400, 401, 403,
])("preserves HTTP %i without implicit recovery in Server Actions", async (status) => {
  const fetch = vi.fn(async () => providerFailure(status));
  vi.stubGlobal("fetch", fetch);
  const chunks = await run();
  expect(chunks.find((chunk) => chunk.type === "error")).toMatchObject({
    failure: {
      code: "PROVIDER_HTTP_ERROR",
      status,
      retryable: [408, 429, 503].includes(status),
      retryAfterMs: 2000,
    },
  });
  expect(JSON.stringify(chunks)).not.toContain("DO_NOT_EXPORT_PROVIDER_SECRET");
  expect(chunks.filter((chunk) => chunk.type === "done")).toHaveLength(1);
  expect(fetch).toHaveBeenCalledOnce();
});

it("returns a safe pre-execution failure rather than a Next.js error digest", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(agent, "streamChat").mockRejectedValueOnce(
    new PersistenceError("private connection details"),
  );
  expect(await run()).toMatchObject([
    { type: "error", failure: { code: "PERSISTENCE_ERROR" } },
    { type: "done" },
  ]);
  expect(fetch).not.toHaveBeenCalled();
});

it("preserves schema validation metadata through the real structured workflow", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => googleResponse('{"draft":{"subject":5}}')),
  );
  expect(
    (await run("reason-structured-stream")).find(
      (chunk) => chunk.type === "error",
    ),
  ).toMatchObject({
    failure: {
      code: "MODEL_OUTPUT_SCHEMA",
      issues: expect.any(Array),
      usage: { total: 5 },
    },
  });
});
