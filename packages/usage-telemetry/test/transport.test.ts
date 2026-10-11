import { expect, it, vi } from "vitest";
import { createUsageTelemetry, type UsageRecord } from "../src/client";
import {
  createCollectorTransport,
  createPostHogTransport,
} from "../src/transport";

const identity = "ae037bc5-7773-42b7-9664-26328dcd121c";
it("sends only explicit anonymous capture records to the EU batch endpoint", async () => {
  const send = vi.fn<typeof fetch>(
    async () => new Response(null, { status: 200 }),
  );
  const client = createUsageTelemetry({
    context: { product: "sdk", component: "agent", version: "1.0.0" },
    identity: () => identity,
    transport: createPostHogTransport({
      key: "phc_publiccapture",
      fetch: send,
    }),
  });
  client
    .start("sdk.execute", {
      content: "secret",
      api_key: "secret",
      provider: "openai",
    })
    .end();
  await client.flush();
  client.dispose();
  expect(String(send.mock.calls[0]?.[0])).toBe(
    "https://eu.i.posthog.com/batch/",
  );
  const request = send.mock.calls[0]?.[1];
  expect(request).toMatchObject({
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { "content-type": "application/json" },
  });
  const body = JSON.parse(String(request?.body));
  expect(body.api_key).toBe("phc_publiccapture");
  expect(body.batch[0]).toMatchObject({
    distinct_id: identity,
    properties: {
      $process_person_profile: false,
      $geoip_disable: true,
      $ip: null,
      count: 1,
      provider: "openai",
      product: "sdk",
    },
  });
  expect(JSON.stringify(body)).not.toContain("secret");
});
it("rejects personal API tokens and remote unencrypted endpoints", () => {
  expect(() => createPostHogTransport({ key: "phx_private" })).toThrow();
  expect(() =>
    createPostHogTransport({ key: "phc_public", host: "http://external.test" }),
  ).toThrow();
  expect(() =>
    createCollectorTransport({ endpoint: "http://external.test" }),
  ).toThrow();
});
it("aborts stalled delivery and exposes rejection only to the helper", async () => {
  vi.useFakeTimers();
  const send = vi.fn<typeof fetch>(
    (_, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      ),
  );
  const transport = createPostHogTransport({
    key: "phc_public",
    fetch: send,
    timeoutMs: 10,
  });
  const result = transport([] as UsageRecord[], identity).catch(
    (error) => error,
  );
  await vi.advanceTimersByTimeAsync(10);
  expect(await result).toBeInstanceOf(Error);
  vi.useRealTimers();
});
it("keeps the collector replacement contract independent of PostHog", async () => {
  const send = vi.fn<typeof fetch>(
    async () => new Response(null, { status: 200 }),
  );
  await createCollectorTransport({
    endpoint: "https://collector.test/usage",
    fetch: send,
  })([], identity);
  expect(JSON.parse(String(send.mock.calls[0]?.[1]?.body))).toEqual({
    identity,
    records: [],
  });
});
