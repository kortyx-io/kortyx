import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createKortyxTelemetryAdapter } from "../src";

const options = {
  endpoint: "https://telemetry.example",
  apiKey: "test-key",
  environment: "test",
  service: { name: "test" },
  diagnostics: { enabled: true },
  flushIntervalMs: 60000,
};
const context = {
  correlation: {
    runId: "run",
    workflowId: "workflow",
    nodeId: "brief",
    invocationId: "invoke",
  },
};
describe("native diagnostic transport", () => {
  it("uploads complete projected bytes with correlation once across propagation and keeps summaries bounded", async () => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const projection = vi.fn(() => ({
      message: "provider",
      type: "ProviderError",
      responseBody: "X".repeat(120000),
      metadata: { password: "private" },
    }));
    const adapter = createKortyxTelemetryAdapter({
      ...options,
      error: projection,
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
        });
        return Response.json({ state: "available" });
      },
    });
    const error = new Error("provider");
    let id: string | void;
    await adapter.trace?.withSpan?.(
      { name: "node", attributes: context.correlation },
      async () => {
        id = adapter.trace?.reportError?.(error);
        adapter.trace?.reportError?.(error);
      },
    );
    await adapter.flush();
    expect(projection).toHaveBeenCalledTimes(1);
    const manifests = requests.filter(
      (request) =>
        new URL(request.url).pathname === "/v1/telemetry/diagnostics",
    );
    expect(manifests).toHaveLength(1);
    expect(manifests[0]?.body.correlation).toMatchObject(context.correlation);
    const parts = requests.filter((request) => request.url.includes("/parts?"));
    const content = JSON.parse(
      Buffer.concat(
        parts.map((part) => Buffer.from(part.body.data as string, "base64")),
      ).toString(),
    );
    expect(content.data.responseBody).toHaveLength(120000);
    expect(content.data.metadata.password).toBe("[REDACTED]");
    expect(
      JSON.stringify(
        requests.filter((request) => request.url.endsWith("events:batch")),
      ),
    ).not.toContain("X".repeat(120000));
    expect(adapter.getDiagnosticDeliveryState(id! as string)).toBe("available");
  });
  it("captures standalone errors without inventing runs, and reports queue pressure", async () => {
    const adapter = createKortyxTelemetryAdapter({
      ...options,
      diagnostics: { enabled: true, maxQueueBytes: 100 },
      fetch: async () => Response.json({}),
    });
    const id = adapter.trace?.reportError?.(new Error("standalone")) as string;
    expect(adapter.getDiagnosticDeliveryState(id)).toBe("dropped");
    expect(await adapter.flushDiagnostics()).toMatchObject({
      pending: 0,
      dropped: 1,
      timedOut: false,
    });
  });
  it("rejects permanent HTTP failures without failing the caller", async () => {
    const adapter = createKortyxTelemetryAdapter({
      ...options,
      fetch: async () => new Response(null, { status: 413 }),
    });
    const id = adapter.trace?.reportError?.(new Error("standalone")) as string;
    await adapter.flushDiagnostics();
    expect(adapter.getDiagnosticDeliveryState(id)).toBe("rejected");
    expect(adapter.getDroppedDiagnosticCount()).toBe(1);
  });
  it("exposes a flush deadline while retaining unacknowledged data", async () => {
    let release!: (response: Response) => void;
    const adapter = createKortyxTelemetryAdapter({
      ...options,
      fetch: async () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    adapter.trace?.reportError?.(new Error("pending"));
    expect(await adapter.flushDiagnostics(10)).toMatchObject({
      timedOut: true,
      pending: 1,
    });
    release(new Response(null, { status: 413 }));
    await adapter.flushDiagnostics();
  });
  it("spools only redacted bytes and resumes stable identities after restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kortyx-diagnostic-"));
    try {
      const first = createKortyxTelemetryAdapter({
        ...options,
        diagnostics: { enabled: true, spoolDirectory: directory },
        fetch: async () => new Response(null, { status: 503 }),
      });
      const id = first.trace?.reportError?.(
        Object.assign(new Error("private"), {
          token: "never-store",
          body: "Bearer never-send",
        }),
      ) as string;
      await first.flushDiagnostics();
      const [namespace] = await readdir(directory);
      const [filename] = await readdir(join(directory, namespace!));
      const disk = await readFile(
        join(directory, namespace!, filename!),
        "utf8",
      );
      expect(disk).not.toContain("never-store");
      expect(disk).not.toContain("never-send");
      expect(JSON.parse(disk).manifest.correlation).toEqual({});
      const restored = createKortyxTelemetryAdapter({
        ...options,
        diagnostics: { enabled: true, spoolDirectory: directory },
        fetch: async () => Response.json({ state: "available" }),
      });
      await restored.flushDiagnostics();
      expect(restored.getDiagnosticDeliveryState(id)).toBe("available");
      expect(await readdir(join(directory, namespace!))).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("honors rate-limit retry hints without discarding the diagnostic", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, { status: 429, headers: { "retry-after": "30" } }),
    );
    const adapter = createKortyxTelemetryAdapter({ ...options, fetch });
    const id = adapter.trace?.reportError?.(
      new Error("rate limited"),
    ) as string;
    await adapter.flushDiagnostics();
    await adapter.flushDiagnostics();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(adapter.getDiagnosticDeliveryState(id)).toBe("pending");
  });

  it("never restores another credential, environment or endpoint's spool", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kortyx-diagnostic-scope-"));
    try {
      const first = createKortyxTelemetryAdapter({
        ...options,
        diagnostics: { enabled: true, spoolDirectory: directory },
        fetch: async () => new Response(null, { status: 503 }),
      });
      first.trace?.reportError?.(new Error("scoped provider response"));
      await first.flushDiagnostics();
      const [originalNamespace] = await readdir(directory);
      for (const scope of [
        { apiKey: "another-key" },
        { environment: "another-environment" },
        { endpoint: "https://another-telemetry.example" },
      ]) {
        const fetch = vi.fn(async () => Response.json({ state: "available" }));
        const other = createKortyxTelemetryAdapter({
          ...options,
          ...scope,
          diagnostics: { enabled: true, spoolDirectory: directory },
          fetch,
        });
        expect(await other.flushDiagnostics()).toMatchObject({ pending: 0 });
        expect(fetch).not.toHaveBeenCalled();
      }
      expect(await readdir(directory)).toHaveLength(4);
      expect(await readdir(join(directory, originalNamespace!))).toHaveLength(
        1,
      );
      expect((await readdir(directory)).join()).not.toContain(options.apiKey);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
