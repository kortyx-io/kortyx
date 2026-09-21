import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  StudioContextResponseSchema,
  type StudioDetailEvent,
  type StudioInterrupt,
  type StudioRun,
} from "@kortyx/telemetry-contracts";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readConnections,
  readKeyEnv,
  resolveConnection,
  saveConnections,
} from "../src/connections";
import { createConnectionsCommand } from "../src/connections-command";
import {
  defaultStudioRuntime,
  runStudioCommand,
  type StudioRuntime,
} from "../src/studio/command";
import {
  analyzeStudioDiagnostics,
  buildStudioTimeline,
  compareCatalogRuntime,
  compareRunAnalysis,
  focusStudioEvents,
} from "../src/studio/read-analysis";
import {
  normalizeConnectionUrl,
  StudioReadClient,
  StudioReadError,
} from "../src/studio/read-client";
import { registerStudioReadCommands } from "../src/studio/read-command";
import {
  parseStudioTarget,
  sanitizeStudioData,
  summarizeEvidence,
} from "../src/studio/read-output";

const key = "ktyx_test_agent_testsecret";
const date = "2026-09-19T12:00:00.000Z";
const context = {
  organization: { name: "Kortyx" },
  project: { name: "Canvas" },
  environments: ["development", "staging"],
  apiKey: { mode: "test", scopes: ["studio:read"] },
  api: { status: "ok", service: "kortyx-api", version: "0.1.0" },
};
const workflow = {
  id: "canvas",
  name: "Canvas",
  description: null,
  versions: ["1", "2"],
  activeVersion: "2",
  activeRevisionId: "revision-2",
  health: "healthy" as const,
  tags: [],
  lastActivityAt: date,
  metrics: {
    runCount: 1,
    successRate: 100,
    errorRate: 0,
    retryCount: 0,
    interruptRate: 0,
    p50DurationMs: 1,
    p95DurationMs: 1,
    averageTokens: 1,
    averageCost: null,
    currency: null,
  },
  nodes: [],
  internalEdges: [],
};
const run: StudioRun = {
  id: "run-1",
  status: "failed",
  startedAt: date,
  endedAt: date,
  workflowId: "canvas",
  workflowIds: ["canvas"],
  workflowRefs: [],
  workflowRevisionId: null,
  declaredVersion: null,
  transitionIds: [],
  path: ["reason"],
  sessionId: "session-1",
  provider: "openai",
  model: "test-model",
  models: ["test-model"],
  durationMs: 100,
  tokens: 10,
  cost: null,
  pricingStatus: "unknown",
  pricingSource: null,
  currency: null,
  result: "sensitive output",
  environment: "staging",
  userId: null,
  tenantId: null,
  hasTool: true,
  hasRetry: false,
  interruptNodeId: null,
};
const session = {
  id: "session-1",
  status: "failed",
  lastActivityAt: date,
  workflowIds: ["canvas"],
  workflowCount: 1,
  activeWorkflowId: "canvas",
  activeVersion: null,
  userId: null,
  tenantId: null,
  runs: 1,
  succeeded: 0,
  failed: 1,
  interrupted: 0,
  checkpoints: 0,
  hasFork: false,
  durationMs: 100,
  tokens: 10,
  cost: null,
  pricingStatus: "unknown",
  pricingSource: null,
  currency: null,
  latestResult: "sensitive output",
  latestError: "Provider unavailable",
  pendingInterruptId: null,
  providers: ["openai"],
  models: ["test-model"],
  tags: [],
  environment: "staging",
};
const interrupt: StudioInterrupt = {
  id: "interrupt-1",
  status: "pending",
  type: "text",
  interactionMode: "freeform",
  contract: null,
  schemaId: null,
  schemaVersion: null,
  createdAt: date,
  resolvedAt: null,
  expiresAt: null,
  question: "sensitive question",
  contentCaptured: true,
  request: null,
  requestCaptured: false,
  optionCount: null,
  options: null,
  workflowId: "canvas",
  nodeId: "reason",
  sessionId: "session-1",
  userId: null,
  tenantId: null,
  response: null,
  responseValue: null,
  responseCaptured: false,
  resumeOutcome: null,
  resumeError: null,
  runId: "run-1",
  resumeToken: "must-not-print",
  resolvedBy: null,
  environment: "staging",
};
const event = (
  id: string,
  type: StudioDetailEvent["type"],
  payload: Record<string, unknown>,
): StudioDetailEvent => ({
  id,
  type,
  occurredAt: date,
  receivedAt: date,
  environment: "staging",
  serviceName: "canvas",
  deploymentRef: "commit-1",
  traceId: "trace-1",
  spanId: "span-1",
  parentSpanId: null,
  runId: "run-1",
  sessionId: "session-1",
  workflowId: "canvas",
  workflowRevisionId: null,
  nodeId: "reason",
  userId: null,
  tenantId: null,
  tags: [],
  metadata: null,
  payload,
});
const events = [
  event("e1", "span.started", { input: { text: "private input" } }),
  event("e2", "span.failed", {
    error: {
      code: "PROVIDER_UNAVAILABLE",
      message: "Provider unavailable",
      authorization: "never-print",
    },
  }),
];
const homes: string[] = [];
const servers: Server[] = [];
const home = async () => {
  const path = await mkdtemp(join(tmpdir(), "kortyx-read-test-"));
  homes.push(path);
  return path;
};
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  await Promise.all(
    homes.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
const profile = (
  name = "staging",
  apiUrl = "https://api.example.test",
  studioUrl = "https://studio.example.test",
) => ({
  name,
  apiUrl,
  studioUrl,
  apiKeyEnv: "KORTYX_TEST_READ_KEY",
  project: "Canvas",
  organization: "Kortyx",
  environment: "staging",
});
const configured = async () => {
  const path = await home();
  vi.stubEnv("KORTYX_TEST_READ_KEY", key);
  vi.stubEnv("KORTYX_CONNECTION", "");
  await saveConnections({ version: 1, profiles: [profile()] }, path);
  return path;
};
const mockFetch = (value: unknown, status = 200) =>
  vi.fn<typeof fetch>().mockImplementation(
    async () =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "x-request-id": "request-1" },
      }),
  );
const cli = (request: typeof fetch) => {
  const output: string[] = [];
  const command = new Command("studio");
  registerStudioReadCommands(command, (text) => output.push(text), request);
  const override = (child: Command) => {
    child.exitOverride();
    child.configureOutput({ writeErr: () => {}, writeOut: () => {} });
    child.commands.forEach(override);
  };
  override(command);
  return {
    output,
    run: (argv: string[]) => command.parseAsync(argv, { from: "user" }),
  };
};

describe("safe Studio API client", () => {
  it("rejects an empty successful response", async () => {
    await expect(
      new StudioReadClient(
        "https://api.example.test",
        key,
        vi.fn().mockResolvedValue(new Response(null)),
      ).get("/v1/studio/context", StudioContextResponseSchema),
    ).rejects.toThrow("empty response");
  });
  it.each([
    "https://api.example.test/",
    "http://localhost:6400",
    "http://127.0.0.1:6400",
    "http://[::1]:6400",
    "https://example.test/kortyx/",
  ])("accepts safe base %s", (url) =>
    expect(normalizeConnectionUrl(url)).not.toMatch(/\/$/));
  it.each([
    "http://remote.test",
    "ftp://remote.test",
    "https://user:password@remote.test",
    "https://remote.test?key=secret",
    "https://remote.test#fragment",
    "not-a-url",
  ])("rejects unsafe base %s", (url) =>
    expect(() => normalizeConnectionUrl(url)).toThrow(StudioReadError));
  it("makes authenticated GETs only and rejects write/arbitrary paths", async () => {
    const request = mockFetch(context);
    const client = new StudioReadClient(
      "https://api.example.test/prefix",
      key,
      request,
    );
    expect(
      await client.get("/v1/studio/context", StudioContextResponseSchema),
    ).toEqual(context);
    expect(request.mock.calls[0]?.[0]?.toString()).toBe(
      "https://api.example.test/prefix/v1/studio/context",
    );
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: { authorization: `Bearer ${key}` },
    });
    for (const path of [
      "/v1/telemetry/events",
      "https://evil.test",
      "/v1/studio/runs/..",
      "/v1/studio/runs/%2e%2e",
      "/v1/studio/runs/1/resume",
    ])
      await expect(
        client.get(path, StudioContextResponseSchema),
      ).rejects.toThrow("Only supported");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([
    [401, "Invalid, expired"],
    [403, "lacks studio:read"],
    [404, "Entity not found"],
    [500, "HTTP 500"],
  ])("handles HTTP %s without echoing secrets", async (status, message) => {
    const client = new StudioReadClient(
      "https://api.example.test",
      key,
      mockFetch({ message: key }, status as number),
    );
    try {
      await client.get("/v1/studio/context", StudioContextResponseSchema);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(StudioReadError);
      expect((error as StudioReadError).message).toContain(message);
      expect(JSON.stringify(error)).not.toContain(key);
      expect((error as StudioReadError).requestId).toBe("request-1");
    }
  });
  it("reports network, malformed JSON, and version errors safely", async () => {
    await expect(
      new StudioReadClient(
        "https://api.example.test",
        key,
        vi.fn().mockRejectedValue(new Error(key)),
      ).get("/v1/studio/context", StudioContextResponseSchema),
    ).rejects.toThrow("timed out");
    await expect(
      new StudioReadClient(
        "https://api.example.test",
        key,
        vi.fn().mockResolvedValue(new Response("not-json")),
      ).get("/v1/studio/context", StudioContextResponseSchema),
    ).rejects.toThrow("JSON response");
    await expect(
      new StudioReadClient("https://api.example.test", key, mockFetch({})).get(
        "/v1/studio/context",
        StudioContextResponseSchema,
      ),
    ).rejects.toThrow("contracts");
    expect(
      () => new StudioReadClient("https://api.example.test", "bad-key"),
    ).toThrow("Expected a Kortyx");
  });
  it("rejects a body exceeding the safety limit", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(20 * 1024 * 1024 + 1)));
    await expect(
      new StudioReadClient("https://api.example.test", key, request).get(
        "/v1/studio/context",
        StudioContextResponseSchema,
      ),
    ).rejects.toThrow("20 MiB");
  });
  it("never follows redirects to another origin", async () => {
    let leaked = false;
    const server = createServer((req, res) => {
      if (req.url === "/evil") {
        leaked = true;
        res.end(JSON.stringify(context));
      } else {
        res.writeHead(302, { location: "/evil" });
        res.end();
      }
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No server");
    await expect(
      new StudioReadClient(`http://127.0.0.1:${address.port}`, key).get(
        "/v1/studio/context",
        StudioContextResponseSchema,
      ),
    ).rejects.toThrow("Redirects are not followed");
    expect(leaked).toBe(false);
  });
});

describe("connection profiles", () => {
  it("supports isolated environment-configured homes and native Studio range names", async () => {
    const path = await configured();
    vi.stubEnv("KORTYX_CONFIG_HOME", path);
    vi.stubEnv("KORTYX_STUDIO_HOME", path);
    expect((await readConnections()).profiles[0]?.name).toBe("staging");
    expect((await resolveConnection({ connection: "staging" })).name).toBe(
      "staging",
    );
    const config = await readConnections();
    await saveConnections(config);
    const request = mockFetch({ runs: [], totalCount: 0 });
    await cli(request).run([
      "runs",
      "list",
      "--connection",
      "staging",
      "--range",
      "Last hour",
    ]);
    expect(
      new URL(String(request.mock.calls[0]?.[0])).searchParams.get("range"),
    ).toBe("Last hour");
  });
  it("lists unselected/local profiles and removes a non-default remote locator", async () => {
    const path = await home();
    const logs: string[] = [];
    const command = (args: string[]) =>
      createConnectionsCommand(
        (text) => logs.push(text),
        mockFetch(context),
      ).parseAsync([...args, "--config-home", path, "--home", path], {
        from: "user",
      });
    await command(["list"]);
    expect(JSON.parse(logs[0] ?? "").connections).toEqual([]);
    const runtime: StudioRuntime = {
      run: async () => ({ stdout: "", stderr: "" }),
      portAvailable: async () => true,
      now: () => date,
      random: (bytes) => "r".repeat(Math.max(bytes, 16)),
      log: () => {},
    };
    await runStudioCommand(["start", "--home", path], runtime);
    await command(["list"]);
    expect(JSON.parse(logs[1] ?? "").connections[0].name).toBe("local");
    await command(["use", "local"]);
    vi.stubEnv("KORTYX_TEST_READ_KEY", key);
    await command([
      "add",
      "staging",
      "--api-url",
      "https://api.example.test",
      "--api-key-env",
      "KORTYX_TEST_READ_KEY",
      "--environment",
      "staging",
    ]);
    await command(["remove", "staging"]);
    expect((await readConnections(path)).current).toBe("local");
  });
  it("rejects invalid names, duplicate selections, invalid URLs, and invalid key references", async () => {
    const path = await home();
    for (const config of [
      { version: 1 as const, profiles: [profile("local")] },
      { version: 1 as const, profiles: [profile(), profile()] },
      { version: 1 as const, profiles: [], current: "missing" },
    ])
      await expect(saveConnections(config, path)).rejects.toThrow(
        "Invalid connection",
      );
    await writeFile(
      join(path, "connections.json"),
      JSON.stringify({
        version: 1,
        profiles: [profile("staging", "http://remote.test")],
      }),
    );
    await expect(readConnections(path)).rejects.toThrow(
      "will not be overwritten",
    );
    await writeFile(
      join(path, "connections.json"),
      JSON.stringify({ version: 2, profiles: [] }),
    );
    await expect(readConnections(path)).rejects.toThrow(
      "will not be overwritten",
    );
    expect(() => readKeyEnv("bad-name")).toThrow("valid environment variable");
  });
  it("uses environment-selected and saved-default connections; empty selection falls back safely", async () => {
    const path = await configured();
    await saveConnections(
      { version: 1, current: "staging", profiles: [profile()] },
      path,
    );
    expect(
      (await resolveConnection({ configHome: path, home: path })).name,
    ).toBe("staging");
    vi.stubEnv("KORTYX_CONNECTION", "staging");
    expect(
      (await resolveConnection({ configHome: path, home: path })).name,
    ).toBe("staging");
    await expect(
      resolveConnection({
        connection: "staging",
        apiUrl: "https://direct.test",
        apiKeyEnv: "KORTYX_TEST_READ_KEY",
        configHome: path,
        home: path,
      }),
    ).rejects.toThrow("without --connection");
    vi.stubEnv("KORTYX_CONNECTION", "");
    const empty = await home();
    await expect(
      resolveConnection({ configHome: empty, home: empty }),
    ).rejects.toThrow("Local Studio is not configured");
  });
  it("reports invalid add/use/remove operations without persisting a profile", async () => {
    const path = await home();
    vi.stubEnv("KORTYX_TEST_READ_KEY", key);
    const request = mockFetch(context);
    const args = ["--config-home", path, "--home", path];
    const command = () => createConnectionsCommand(() => {}, request);
    await expect(
      command().parseAsync(
        [
          "add",
          "local",
          "--api-url",
          "https://api.example.test",
          "--api-key-env",
          "KORTYX_TEST_READ_KEY",
          ...args,
        ],
        { from: "user" },
      ),
    ).rejects.toThrow("reserved");
    await expect(
      command().parseAsync(["use", "missing", ...args], { from: "user" }),
    ).rejects.toThrow("Connection not found");
    await expect(
      command().parseAsync(["use", "local", ...args], { from: "user" }),
    ).rejects.toThrow("Connection not found");
    await expect(
      command().parseAsync(["remove", "missing", ...args], { from: "user" }),
    ).rejects.toThrow("Saved connection not found");
    await expect(
      createConnectionsCommand(
        () => {},
        mockFetch({
          ...context,
          apiKey: { mode: "test", scopes: ["telemetry:write"] },
        }),
      ).parseAsync(
        [
          "add",
          "staging",
          "--api-url",
          "https://api.example.test",
          "--api-key-env",
          "KORTYX_TEST_READ_KEY",
          ...args,
        ],
        { from: "user" },
      ),
    ).rejects.toThrow("lacks studio:read");
    expect(request).not.toHaveBeenCalled();
  });
  it("stores non-secret configuration privately and resolves URL/project connections", async () => {
    const path = await configured();
    expect(await readConnections(path)).toMatchObject({
      version: 1,
      profiles: [profile()],
    });
    expect(
      await resolveConnection({
        connection: "staging",
        configHome: path,
        home: path,
      }),
    ).toMatchObject({ name: "staging", apiKey: key });
    expect(
      await resolveConnection(
        { configHome: path, home: path },
        "https://studio.example.test/runs/run-1",
      ),
    ).toMatchObject({ name: "staging" });
    const raw = await readFile(join(path, "connections.json"), "utf8");
    expect(raw).not.toContain(key);
    if (process.platform !== "win32")
      expect((await stat(join(path, "connections.json"))).mode & 0o777).toBe(
        0o600,
      );
  });
  it("does not send existing keys to URL overrides, unknown hosts, or ambiguous projects", async () => {
    const path = await configured();
    const options = { configHome: path, home: path };
    await expect(
      resolveConnection({ ...options, apiUrl: "https://evil.test" }),
    ).rejects.toThrow("both --api-url");
    await expect(
      resolveConnection(options, "https://evil.test/runs/run-1"),
    ).rejects.toThrow("does not match");
    await expect(
      resolveConnection(
        { ...options, connection: "staging" },
        "https://evil.test/runs/run-1",
      ),
    ).rejects.toThrow("does not match");
    await saveConnections(
      {
        version: 1,
        current: "staging",
        profiles: [profile(), profile("support")],
      },
      path,
    );
    await expect(
      resolveConnection(options, "https://studio.example.test/runs/run-1"),
    ).rejects.toThrow("multiple projects");
    expect(
      await resolveConnection(
        { ...options, connection: "support" },
        "https://studio.example.test/runs/run-1",
      ),
    ).toMatchObject({ name: "support" });
  });
  it("respects configured base paths without accepting sibling prefixes", async () => {
    const path = await configured();
    await saveConnections(
      {
        version: 1,
        profiles: [
          profile(
            "staging",
            "https://api.example.test/kortyx",
            "https://studio.example.test/kortyx",
          ),
        ],
      },
      path,
    );
    expect(
      await resolveConnection(
        { configHome: path, home: path },
        "https://studio.example.test/kortyx/runs/run-1",
      ),
    ).toMatchObject({ name: "staging" });
    await expect(
      resolveConnection(
        { configHome: path, home: path },
        "https://studio.example.test/kortyx-evil/runs/run-1",
      ),
    ).rejects.toThrow("does not match");
  });
  it("validates missing credentials, selections, and configuration without overwriting it", async () => {
    const path = await configured();
    vi.stubEnv("KORTYX_TEST_READ_KEY", "");
    await expect(
      resolveConnection({
        connection: "staging",
        configHome: path,
        home: path,
      }),
    ).rejects.toThrow("Set KORTYX_TEST_READ_KEY");
    await expect(
      resolveConnection({
        connection: "missing",
        configHome: path,
        home: path,
      }),
    ).rejects.toThrow("Connection not found");
    await writeFile(join(path, "connections.json"), "{bad-json");
    await expect(readConnections(path)).rejects.toThrow(
      "will not be overwritten",
    );
    expect(await readFile(join(path, "connections.json"), "utf8")).toBe(
      "{bad-json",
    );
  });
  it("supports an explicit direct API/key pair for IDs, never pasted URLs", async () => {
    const path = await configured();
    const options = {
      configHome: path,
      home: path,
      apiUrl: "https://direct.example.test",
      apiKeyEnv: "KORTYX_TEST_READ_KEY",
    };
    expect(await resolveConnection(options)).toMatchObject({
      name: "direct",
      apiUrl: options.apiUrl,
      apiKey: key,
    });
    await expect(
      resolveConnection(options, "https://direct.example.test/runs/run-1"),
    ).rejects.toThrow("Register a connection");
  });
  it("adds, selects, lists, replaces, and removes profiles without remote writes or secret output", async () => {
    const path = await home();
    vi.stubEnv("KORTYX_TEST_READ_KEY", key);
    const request = mockFetch(context);
    const output: string[] = [];
    const runCommand = (args: string[]) =>
      createConnectionsCommand((text) => output.push(text), request).parseAsync(
        [...args, "--config-home", path, "--home", path, "--json"],
        { from: "user" },
      );
    await runCommand([
      "add",
      "staging",
      "--api-url",
      "https://api.example.test",
      "--studio-url",
      "https://studio.example.test",
      "--api-key-env",
      "KORTYX_TEST_READ_KEY",
    ]);
    await expect(
      runCommand([
        "add",
        "staging",
        "--api-url",
        "https://api.example.test",
        "--api-key-env",
        "KORTYX_TEST_READ_KEY",
      ]),
    ).rejects.toThrow("--replace");
    await runCommand([
      "add",
      "staging",
      "--replace",
      "--api-url",
      "https://api.example.test",
      "--api-key-env",
      "KORTYX_TEST_READ_KEY",
    ]);
    await runCommand(["use", "staging"]);
    expect((await readConnections(path)).current).toBe("staging");
    await runCommand(["list"]);
    expect(output.join("\n")).not.toContain(key);
    expect(request.mock.calls.every((call) => call[1]?.method === "GET")).toBe(
      true,
    );
    await runCommand(["remove", "staging"]);
    expect((await readConnections(path)).profiles).toEqual([]);
  });
  it("does not persist unverified connections", async () => {
    const path = await home();
    vi.stubEnv("KORTYX_TEST_READ_KEY", key);
    await expect(
      createConnectionsCommand(() => {}, mockFetch({}, 403)).parseAsync(
        [
          "add",
          "staging",
          "--api-url",
          "https://api.example.test",
          "--api-key-env",
          "KORTYX_TEST_READ_KEY",
          "--config-home",
          path,
        ],
        { from: "user" },
      ),
    ).rejects.toThrow("lacks studio:read");
    expect((await readConnections(path)).profiles).toEqual([]);
  });
  it("reuses managed local keys and follows local credential rotation without profile secret copies", async () => {
    const path = await home();
    const runtime: StudioRuntime = {
      run: async () => ({ stdout: "", stderr: "" }),
      portAvailable: async () => true,
      now: () => date,
      random: (bytes) => "r".repeat(Math.max(bytes, 16)),
      log: () => {},
    };
    await runStudioCommand(["start", "--home", path], runtime);
    const first = await resolveConnection({ configHome: path, home: path });
    expect(first).toMatchObject({
      name: "local",
      apiUrl: "http://localhost:6400",
      studioUrl: "http://localhost:6300",
    });
    const raw = await readFile(join(path, ".env"), "utf8");
    await writeFile(join(path, ".env"), raw.replace(first.apiKey, key));
    expect(
      (await resolveConnection({ configHome: path, home: path })).apiKey,
    ).toBe(key);
  });
});

describe("Studio URL inspection and evidence", () => {
  it("keeps default-runtime parser errors on stderr, never JSON stdout", async () => {
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runStudioCommand(
        ["runs", "list", "--limit", "0", "--json"],
        defaultStudioRuntime,
      ),
    ).rejects.toThrow("integer");
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
    defaultStudioRuntime.error?.();
  });
  it("rejects malformed absolute URLs and preserves benign contextual events", () => {
    expect(() => parseStudioTarget("https://")).toThrow("Invalid Studio URL");
    expect(
      summarizeEvidence([
        event("denied", "tool.denied", { outcome: "denied" }),
        event("limit", "run.limit_reached", { limit: "nodes" }),
      ]).findings.every((finding) => finding.severity === "context"),
    ).toBe(true);
  });
  it("runs the integrated Studio command with default limits and explicit content capture", async () => {
    const path = await configured();
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async (url) =>
          new Response(
            JSON.stringify(
              String(url).endsWith("/context")
                ? context
                : { run, session, events, interrupts: [], updatedAt: date },
            ),
          ),
      );
    vi.stubGlobal("fetch", request);
    const output: string[] = [];
    const runtime: StudioRuntime = {
      run: async () => ({ stdout: "", stderr: "" }),
      portAvailable: async () => true,
      now: () => date,
      random: () => "test",
      log: (text = "") => output.push(text),
    };
    await runStudioCommand(
      [
        "runs",
        "get",
        "run-1",
        "--connection",
        "staging",
        "--config-home",
        path,
        "--home",
        path,
        "--include-content",
      ],
      runtime,
    );
    expect(output.join("\n")).toContain("sensitive output");
    expect(output.join("\n")).not.toContain("never-print");
    expect(JSON.parse(output[0] ?? "").coverage.omittedEvents).toBe(0);
  });
  it("translates all supported filters and terminates empty pagination", async () => {
    const path = await configured();
    const request = mockFetch({ runs: [], totalCount: 0 });
    const command = cli(request);
    await command.run([
      "runs",
      "list",
      "--connection",
      "staging",
      "--config-home",
      path,
      "--home",
      path,
      "--workflow",
      "canvas",
      "--session",
      "session-1",
      "--user",
      "user-1",
      "--tenant",
      "tenant-1",
      "--model",
      "test",
      "--node",
      "reason",
      "--tool",
      "lookup",
      "--tool-outcome",
      "fault",
      "--q",
      "error",
      "--environment",
      "development",
    ]);
    const query = Object.fromEntries(
      new URL(String(request.mock.calls[0]?.[0])).searchParams,
    );
    expect(query).toMatchObject({
      range: "24 hours",
      env: "development",
      workflow: "canvas",
      session: "session-1",
      user: "user-1",
      tenant: "tenant-1",
      model: "test",
      node: "reason",
      tool: "lookup",
      toolOutcome: "fault",
      q: "error",
    });
    expect(JSON.parse(command.output[0] ?? "").page.nextCursor).toBe(null);
    const workflows = cli(
      mockFetch({
        workflows: [],
        transitions: [],
        cohort: {
          range: "24 hours",
          startedAfter: date,
          startedBefore: date,
          workflowId: "canvas",
          version: "v1",
        },
      }),
    );
    await workflows.run([
      "workflows",
      "list",
      "--connection",
      "staging",
      "--config-home",
      path,
      "--home",
      path,
      "--workflow",
      "canvas",
      "--version",
      "v1",
    ]);
  });
  it("extracts entity IDs, keeps branch/call context, and discards arbitrary query parameters", () => {
    expect(
      parseStudioTarget(
        "https://studio.example.test/runs/run-1?tab=calls&call=child&branch=fork&trace=trace-1&detailView=timeline&token=private",
      ),
    ).toEqual({
      entity: "runs",
      id: "run-1",
      url: "https://studio.example.test/runs/run-1",
      selection: {
        tab: "calls",
        call: "child",
        branch: "fork",
        trace: "trace-1",
        detailView: "timeline",
      },
    });
    expect(parseStudioTarget("session-1", "sessions")).toEqual({
      entity: "sessions",
      id: "session-1",
    });
    expect(
      parseStudioTarget(
        "https://api.example.test/v1/studio/interrupts/interrupt-1",
      ).entity,
    ).toBe("interrupts");
  });
  it.each([
    "https://studio.example.test/runs",
    "https://studio.example.test/runs/a%2Fb",
    "https://studio.example.test/runs/%ZZ",
    "https://user:password@studio.example.test/runs/1",
    "javascript:bad",
    "run-1",
  ])("rejects invalid URL %s", (input) =>
    expect(() => parseStudioTarget(input)).toThrow(StudioReadError));
  it("rejects mismatched types and unsafe bare IDs", () => {
    expect(() =>
      parseStudioTarget("https://studio.example.test/runs/1", "sessions"),
    ).toThrow("does not match");
    for (const id of ["..", ".", "a/b", "a?b", "a\\b", "a b"])
      expect(() => parseStudioTarget(id, "runs")).toThrow("Invalid");
  });
  it("omits content by default and always redacts resume tokens and credentials", () => {
    const value = {
      input: "private",
      output: "private",
      prompt: { messages: "private" },
      resumeToken: "secret-token",
      metadata: { authorization: "secret", api_key: key },
      error: { message: `bad key ${key} Bearer access-token` },
      context,
    };
    const omitted = JSON.stringify(sanitizeStudioData(value, false));
    expect(omitted).not.toContain("private");
    expect(omitted).not.toContain("secret-token");
    expect(omitted).not.toContain(key);
    const included = JSON.stringify(sanitizeStudioData(value, true));
    expect(included).toContain("private");
    expect(included).not.toContain("secret-token");
    expect(included).not.toContain("access-token");
    expect(sanitizeStudioData(context, false)).toEqual(context);
    expect(summarizeEvidence(events).findings).toMatchObject([
      { eventId: "e2", severity: "error" },
    ]);
  });
  it("builds a compact model/tool/interrupt timeline and evidence-based loop diagnostics", () => {
    const sequence = [
      {
        ...event("model", "generation.completed", {
          provider: "openai",
          model: "gpt-test",
          durationMs: 1350,
          finishReason: { unified: "tool-calls" },
        }),
        occurredAt: "2026-09-19T12:00:00.000Z",
      },
      {
        ...event("resume", "interrupt.resolved", {
          interruptId: "interrupt-b",
          contract: "jobPicker",
          responseValue: { type: "select", jobId: "job-1" },
          resumeOutcome: "resumed",
        }),
        occurredAt: "2026-09-19T12:00:02.500Z",
      },
      {
        ...event("interrupt-a", "interrupt.created", {
          interruptId: "interrupt-a",
          kind: "text",
          interactionMode: "freeform",
          question: "Private question",
        }),
        occurredAt: "2026-09-19T12:00:01.000Z",
      },
      {
        ...event("interrupt-b", "interrupt.created", {
          interruptId: "interrupt-b",
          kind: "custom",
          contract: "jobPicker",
          schemaId: "wolly.job-picker",
          schemaVersion: "1",
          request: { question: "Which job?" },
        }),
        occurredAt: "2026-09-19T12:00:02.000Z",
      },
      {
        ...event("tool-a", "tool.completed", {
          name: "search_jobs",
          outcome: "success",
          durationMs: 40,
          input: { location: "Berlin", query: "engineer" },
        }),
        occurredAt: "2026-09-19T12:00:03.000Z",
      },
      {
        ...event("tool-b", "tool.completed", {
          name: "search_jobs",
          outcome: "success",
          durationMs: 41,
          input: { query: "engineer", location: "Berlin" },
        }),
        occurredAt: "2026-09-19T12:00:04.000Z",
      },
      {
        ...event("limit", "run.limit_reached", {
          limit: "maxToolCalls",
          consumed: 2,
          maximum: 2,
        }),
        occurredAt: "2026-09-19T12:00:05.000Z",
      },
    ];
    expect(buildStudioTimeline(sequence)).toMatchObject([
      { step: 1, kind: "model", model: "gpt-test", durationMs: 1350 },
      { step: 2, kind: "interrupt", interruptType: "text" },
      {
        step: 3,
        kind: "interrupt",
        contract: "jobPicker",
        schemaId: "wolly.job-picker",
        schemaVersion: "1",
        request: { question: "Which job?" },
      },
      {
        step: 4,
        kind: "resume",
        contract: "jobPicker",
        response: { type: "select", jobId: "job-1" },
        resumeOutcome: "resumed",
      },
      {
        step: 5,
        kind: "tool",
        toolName: "search_jobs",
        toolOutcome: "success",
      },
      { step: 6, kind: "tool", toolName: "search_jobs" },
      { step: 7, kind: "limit", limit: "maxToolCalls" },
    ]);
    expect(
      analyzeStudioDiagnostics(sequence).map((finding) => finding.code),
    ).toEqual([
      "repeated_tool_input",
      "consecutive_human_interrupts",
      "tool_step_limit_reached",
    ]);
  });
  it("keeps sparse timeline facts compact without inventing missing metadata", () => {
    const matchedInterrupt: StudioInterrupt = {
      ...interrupt,
      resumeToken: null,
      question: "Captured question",
    };
    const sparse = buildStudioTimeline(
      [
        event("empty-model", "generation.completed", {}),
        event("empty-tool", "tool.completed", {}),
        event("legacy-tool", "tool.failed", {
          tool: "legacy",
          toolCallId: "call-1",
          output: "fault",
        }),
        event("matched-interrupt", "interrupt.created", {
          interruptId: "interrupt-1",
        }),
        event("empty-interrupt", "interrupt.created", {}),
        event("empty-resume", "interrupt.resolved", {}),
        event("empty-limit", "run.limit_reached", {}),
        event("ignored", "span.ended", {}),
      ],
      [matchedInterrupt],
    );
    expect(sparse).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "model" }),
        expect.objectContaining({ kind: "tool", toolOutcome: "success" }),
        expect.objectContaining({
          kind: "tool",
          toolName: "legacy",
          toolOutcome: "failed",
          toolCallId: "call-1",
        }),
        expect.objectContaining({
          kind: "interrupt",
          interruptType: "text",
          interactionMode: "freeform",
          question: "Captured question",
        }),
        expect.objectContaining({ kind: "resume" }),
        expect.objectContaining({ kind: "limit" }),
      ]),
    );
  });
  it("focuses pasted execution selectors and rejects selectors with no matching evidence", () => {
    const call = event("call", "workflow.call.completed", {
      invocationId: "child-1",
      callId: "call-1",
      branchId: "fork-1",
      targetWorkflowId: "child",
    });
    expect(
      focusStudioEvents([call, ...events], {
        entity: "runs",
        id: "run-1",
        selection: { call: "call-1", branch: "fork-1" },
      }),
    ).toMatchObject({
      events: [{ id: "call" }],
      applied: { call: "call-1", branch: "fork-1" },
    });
    expect(() =>
      focusStudioEvents(events, {
        entity: "runs",
        id: "run-1",
        selection: { event: "missing" },
      }),
    ).toThrow("did not match");
    expect(() =>
      focusStudioEvents(events, {
        entity: "runs",
        id: "run-1",
        selection: { tab: "timeline" },
      }),
    ).toThrow("no event, trace, node, branch, or call");
    expect(() =>
      focusStudioEvents(events, { entity: "runs", id: "run-1" }),
    ).toThrow("no event, trace, node, branch, or call");
    for (const selection of [
      { event: "e1" },
      { trace: "trace-1" },
      { node: "reason" },
    ])
      expect(
        focusStudioEvents(events, {
          entity: "runs",
          id: "run-1",
          selection,
        }).events.length,
      ).toBeGreaterThan(0);
    const toolCall = event("tool-call", "tool.completed", {
      callId: "direct-call",
    });
    expect(
      focusStudioEvents([toolCall], {
        entity: "runs",
        id: "run-1",
        selection: { call: "direct-call" },
      }).events,
    ).toEqual([toolCall]);
  });
  it("reports catalog drift and the first meaningful run divergence", () => {
    const executed: StudioRun = {
      ...run,
      status: "failed",
      workflowRevisionId: "revision-1",
      declaredVersion: "1",
    };
    const catalog = compareCatalogRuntime(executed, [workflow]);
    expect(catalog.status).toBe("drift");
    const leftTimeline = buildStudioTimeline([
      event("left", "generation.completed", { model: "a", durationMs: 1 }),
    ]);
    const rightTimeline = buildStudioTimeline([
      event("right", "generation.completed", { model: "b", durationMs: 1 }),
    ]);
    expect(
      compareRunAnalysis(
        { run: executed, timeline: leftTimeline, catalog },
        { run: { ...executed, model: "b" }, timeline: rightTimeline, catalog },
      ),
    ).toMatchObject({
      different: true,
      firstDivergence: 1,
      metadata: [{ field: "model", left: "test-model", right: "b" }],
    });
  });
  it("detects schema repair attempts, terminal schema failures, and unresolved interrupts", () => {
    const schemaFailure = {
      ...event("schema", "span.failed", {
        error: { code: "MODEL_OUTPUT_SCHEMA", message: "invalid output" },
      }),
      occurredAt: "2026-09-19T12:00:00.000Z",
    };
    const repair = {
      ...event("repair", "generation.completed", { model: "gpt-test" }),
      occurredAt: "2026-09-19T12:00:01.000Z",
    };
    const interruptedRun: StudioRun = {
      ...run,
      status: "interrupted",
      endedAt: null,
    };
    const pending = {
      ...interrupt,
      id: "interrupt-a",
      resumeToken: null,
    };
    expect(
      analyzeStudioDiagnostics(
        [
          schemaFailure,
          repair,
          event("ask", "interrupt.created", { interruptId: "interrupt-a" }),
        ],
        interruptedRun,
        [pending],
      ).map((finding) => finding.code),
    ).toEqual(["output_schema_retry", "unresolved_interrupt"]);
    expect(analyzeStudioDiagnostics([schemaFailure])[0]).toMatchObject({
      code: "output_schema_failure",
      severity: "error",
    });
  });
  it("covers current, unpublished, and version-only catalog comparisons", () => {
    const currentRun: StudioRun = {
      ...run,
      status: "failed",
      workflowRevisionId: "revision-2",
      declaredVersion: "2",
      workflowRefs: [
        {
          workflowId: "canvas",
          workflowRevisionId: "revision-2",
          declaredVersion: "2",
        },
      ],
    };
    expect(compareCatalogRuntime(currentRun, [workflow]).status).toBe(
      "current",
    );
    expect(compareCatalogRuntime(currentRun, []).status).toBe("not-published");
    expect(
      compareCatalogRuntime(
        {
          ...currentRun,
          workflowRevisionId: null,
          declaredVersion: "1",
          workflowRefs: [],
        },
        [workflow],
      ).status,
    ).toBe("drift");
  });
  it("classifies equal, changed, divergent, added, and removed timeline steps", () => {
    const catalog = compareCatalogRuntime(
      { ...run, status: "failed", workflowRevisionId: "revision-2" },
      [workflow],
    );
    const [model] = buildStudioTimeline([
      event("model", "generation.completed", { model: "same", durationMs: 1 }),
    ]);
    if (!model) throw new Error("Expected model timeline item");
    const changed = {
      ...model,
      eventId: "other",
      at: "2026-09-20T00:00:00.000Z",
      durationMs: 2,
    };
    const [tool] = buildStudioTimeline([
      event("tool", "tool.failed", { tool: "lookup" }),
    ]);
    if (!tool) throw new Error("Expected tool timeline item");
    const base = { run: { ...run, status: "failed" as const }, catalog };
    expect(
      compareRunAnalysis(
        { ...base, timeline: [model, tool], deploymentRefs: ["a"] },
        { ...base, timeline: [model], deploymentRefs: ["b"] },
      ),
    ).toMatchObject({
      timeline: [{ status: "same" }, { status: "removed" }],
      metadata: [{ field: "deploymentRefs" }],
    });
    expect(
      compareRunAnalysis(
        { ...base, timeline: [model] },
        { ...base, timeline: [changed, tool] },
      ).timeline,
    ).toMatchObject([{ status: "changed" }, { status: "added" }]);
    expect(
      compareRunAnalysis(
        { ...base, timeline: [model] },
        { ...base, timeline: [tool] },
      ).timeline[0]?.status,
    ).toBe("diverged");
    expect(
      compareRunAnalysis({ ...base, timeline: [] }, { ...base, timeline: [] }),
    ).toMatchObject({ different: false, firstDivergence: null });
  });
  it.each([
    [
      "runs",
      { run, events, session, interrupts: [interrupt], updatedAt: date },
    ],
    [
      "sessions",
      {
        session,
        runs: [run],
        events,
        interrupts: [interrupt],
        updatedAt: date,
      },
    ],
    ["interrupts", { interrupt, run, session, events, updatedAt: date }],
  ] as const)("inspects %s with bounded events, project context, evidence, and safe output", async (entity, detail) => {
    const path = await configured();
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async (url) =>
          new Response(
            JSON.stringify(String(url).endsWith("/context") ? context : detail),
          ),
      );
    const command = cli(request);
    const id =
      entity === "runs"
        ? "run-1"
        : entity === "sessions"
          ? "session-1"
          : "interrupt-1";
    await command.run([
      "inspect",
      `https://studio.example.test/${entity}/${id}`,
      "--config-home",
      path,
      "--home",
      path,
      "--event-limit",
      "1",
      "--json",
    ]);
    const value = JSON.parse(command.output[0] ?? "");
    expect(value).toMatchObject({
      schemaVersion: 1,
      connection: { name: "staging", context },
      coverage: { returnedEvents: 1, availableEvents: 2, omittedEvents: 1 },
    });
    expect(value.detail.events[0].id).toBe("e2");
    expect(value.diagnostics.findings[0].eventId).toBe("e2");
    expect(command.output.join("\n")).not.toContain("must-not-print");
    expect(command.output.join("\n")).not.toContain("sensitive output");
    expect(request.mock.calls[1]?.[0]?.toString()).toBe(
      `https://api.example.test/v1/studio/${entity}/${id}`,
    );
  });
  it("focuses URL-selected evidence and reports catalog/runtime drift", async () => {
    const path = await configured();
    const driftedRun = {
      ...run,
      workflowRevisionId: "revision-1",
      declaredVersion: "1",
    };
    const focusedEvent = event("selected", "run.limit_reached", {
      limit: "maxToolCalls",
      consumed: 4,
      maximum: 4,
    });
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const value =
        url.pathname === "/v1/studio/context"
          ? context
          : url.pathname === "/v1/studio/workflows"
            ? {
                workflows: [workflow],
                transitions: [],
                cohort: {
                  range: "All time",
                  startedAfter: date,
                  startedBefore: date,
                  workflowId: "canvas",
                  version: null,
                },
              }
            : {
                run: driftedRun,
                session,
                events: [events[0], focusedEvent],
                interrupts: [],
                updatedAt: date,
              };
      return new Response(JSON.stringify(value));
    });
    const command = cli(request);
    await command.run([
      "inspect",
      "https://studio.example.test/runs/run-1?event=selected&detailView=timeline",
      "--config-home",
      path,
      "--home",
      path,
      "--focus-selection",
      "--json",
    ]);
    const value = JSON.parse(command.output[0] ?? "");
    expect(value).toMatchObject({
      detail: { events: [{ id: "selected" }] },
      timeline: [{ kind: "limit", eventId: "selected" }],
      catalog: { status: "drift" },
      coverage: {
        selectionFocus: {
          applied: { event: "selected" },
          matchedEvents: 1,
          totalEvents: 2,
        },
      },
    });
    expect(
      value.diagnostics.findings.some(
        (finding: { code?: string }) =>
          finding.code === "catalog_runtime_drift",
      ),
    ).toBe(true);
  });
  it("compares two runs through the read-only command", async () => {
    const path = await configured();
    const leftEvent = event("left-model", "generation.completed", {
      provider: "openai",
      model: "model-a",
      durationMs: 10,
      finishReason: { unified: "tool-calls" },
    });
    const rightEvent = {
      ...event("right-tool", "tool.completed", {
        name: "search_jobs",
        outcome: "success",
        output: "3 candidates",
      }),
      deploymentRef: "commit-2",
      runId: "run-2",
    };
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      let value: unknown;
      if (url.pathname === "/v1/studio/context") value = context;
      else if (url.pathname === "/v1/studio/workflows")
        value = {
          workflows: [workflow],
          transitions: [],
          cohort: {
            range: "All time",
            startedAfter: date,
            startedBefore: date,
            workflowId: "canvas",
            version: null,
          },
        };
      else if (url.pathname.endsWith("/run-1"))
        value = {
          run: {
            ...run,
            workflowRevisionId: "revision-1",
            declaredVersion: "1",
          },
          session,
          events: [
            { ...events[0], occurredAt: "2026-09-19T12:00:01.000Z" },
            leftEvent,
          ],
          interrupts: [],
          updatedAt: date,
        };
      else
        value = {
          run: {
            ...run,
            id: "run-2",
            status: "completed",
            workflowRevisionId: "revision-2",
            declaredVersion: "2",
            model: "model-b",
            result: "different result",
          },
          session,
          events: [
            { ...events[0], id: "right-span", runId: "run-2" },
            rightEvent,
          ],
          interrupts: [],
          updatedAt: date,
        };
      return new Response(JSON.stringify(value));
    });
    const command = cli(request);
    await command.run([
      "runs",
      "compare",
      "run-1",
      "run-2",
      "--connection",
      "staging",
      "--config-home",
      path,
      "--home",
      path,
      "--include-content",
      "--event-limit",
      "1",
      "--json",
    ]);
    const value = JSON.parse(command.output[0] ?? "");
    expect(value).toMatchObject({
      left: {
        run: { id: "run-1" },
        timeline: [{ kind: "model" }],
        catalog: { status: "drift" },
      },
      right: {
        run: { id: "run-2" },
        timeline: [{ kind: "tool", output: "3 candidates" }],
        catalog: { status: "current" },
      },
      comparison: { different: true, firstDivergence: 1 },
    });
    expect(request).toHaveBeenCalledTimes(5);
  });
  it("keeps run comparison useful when the optional catalog lookup is unavailable", async () => {
    const path = await configured();
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/studio/context")
        return new Response(JSON.stringify(context));
      if (url.pathname === "/v1/studio/workflows")
        return new Response("{}", { status: 503 });
      return new Response(
        JSON.stringify({
          run: {
            ...run,
            id: url.pathname.endsWith("run-2") ? "run-2" : "run-1",
          },
          session,
          events: [],
          interrupts: [],
          updatedAt: date,
        }),
      );
    });
    const command = cli(request);
    await command.run([
      "runs",
      "compare",
      "run-1",
      "run-2",
      "--connection",
      "staging",
      "--config-home",
      path,
      "--home",
      path,
      "--json",
    ]);
    const value = JSON.parse(command.output[0] ?? "");
    expect(value.left.catalog).toMatchObject({
      status: "unavailable",
      reason: "api_error",
    });
    expect(value.right.catalog.status).toBe("unavailable");
  });
  it("keeps child calls distinct across branches and does not duplicate full events", async () => {
    const path = await configured();
    const callEvents = [
      event("call1", "workflow.call.failed", {
        invocationId: "same",
        targetWorkflowId: "child",
        branchId: "original",
        sequence: 1,
        error: "fault",
      }),
      event("call2", "workflow.call.completed", {
        invocationId: "same",
        targetWorkflowId: "child",
        branchId: "fork",
        sequence: 1,
        output: "private child result",
      }),
    ];
    const request = vi.fn<typeof fetch>().mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("/context")
              ? context
              : {
                  run,
                  session,
                  events: callEvents,
                  interrupts: [],
                  updatedAt: date,
                },
          ),
        ),
    );
    const command = cli(request);
    await command.run([
      "runs",
      "get",
      "run-1",
      "--connection",
      "staging",
      "--config-home",
      path,
      "--home",
      path,
      "--json",
    ]);
    const value = JSON.parse(command.output[0] ?? "");
    expect(value.calls).toHaveLength(2);
    expect(
      value.calls.map((call: { branchId: string }) => call.branchId),
    ).toEqual(["original", "fork"]);
    expect(value.calls[0].events).toBeUndefined();
    expect(value.calls[0].eventIds).toEqual(["call1"]);
    expect(command.output[0]).not.toContain("private child result");
  });
  it.each([
    ["runs", { runs: [run], totalCount: 3 }],
    ["sessions", { sessions: [session], totalCount: 3 }],
    ["interrupts", { interrupts: [interrupt], totalCount: 3 }],
  ] as const)("reads filtered %s pages with correct API presets and nextCursor", async (entity, response) => {
    const path = await configured();
    const request = mockFetch(response);
    const command = cli(request);
    await command.run([
      entity,
      "list",
      "--connection",
      "staging",
      "--config-home",
      path,
      "--home",
      path,
      "--status",
      "failed",
      "--range",
      "1h",
      "--limit",
      "1",
      "--cursor",
      "1",
      "--include-children",
      "--json",
    ]);
    const query = new URL(String(request.mock.calls[0]?.[0])).searchParams;
    expect(Object.fromEntries(query)).toMatchObject({
      range: "Last hour",
      pageSize: "1",
      cursor: "1",
      env: "staging",
      status: "failed",
      includeChildren: "true",
    });
    expect(JSON.parse(command.output[0] ?? "").page).toEqual({
      cursor: 1,
      limit: 1,
      nextCursor: 2,
    });
  });
  it("sends custom time boundaries explicitly and rejects incomplete ranges before requests", async () => {
    const path = await configured();
    const request = mockFetch({ runs: [], totalCount: 0 });
    const args = [
      "runs",
      "list",
      "--connection",
      "staging",
      "--config-home",
      path,
      "--home",
      path,
    ];
    await cli(request).run([
      ...args,
      "--started-after",
      "2026-09-18T00:00:00Z",
      "--started-before",
      date,
    ]);
    expect(
      new URL(String(request.mock.calls[0]?.[0])).searchParams.get("range"),
    ).toBe("Custom range");
    await expect(
      cli(request).run([...args, "--started-after", date]),
    ).rejects.toThrow("required");
    expect(request).toHaveBeenCalledTimes(1);
    await expect(cli(request).run([...args, "--limit", "0"])).rejects.toThrow(
      "integer",
    );
  });
  it("verifies a project with doctor and returns catalogs without exposing the key", async () => {
    const path = await configured();
    const args = [
      "--connection",
      "staging",
      "--config-home",
      path,
      "--home",
      path,
      "--json",
    ];
    const doctor = cli(mockFetch(context));
    await doctor.run(["doctor", ...args]);
    expect(JSON.parse(doctor.output[0] ?? "").context.project.name).toBe(
      "Canvas",
    );
    expect(doctor.output[0]).not.toContain(key);
    const catalogs = cli(
      mockFetch({
        environments: ["staging"],
        providers: [],
        models: [],
        workflows: ["canvas"],
        tags: [],
      }),
    );
    await catalogs.run(["catalogs", ...args]);
    expect(JSON.parse(catalogs.output[0] ?? "").data.workflows).toEqual([
      "canvas",
    ]);
  });
  it("reads workflow topology and refuses unsupported explicit environment filters", async () => {
    const path = await configured();
    const request = mockFetch({
      workflows: [],
      transitions: [],
      cohort: {
        range: "All time",
        startedAfter: null,
        startedBefore: null,
        workflowId: null,
        version: null,
      },
    });
    const args = [
      "workflows",
      "list",
      "--connection",
      "staging",
      "--config-home",
      path,
      "--home",
      path,
      "--range",
      "all",
      "--json",
    ];
    const command = cli(request);
    await command.run(args);
    expect(
      new URL(String(request.mock.calls[0]?.[0])).searchParams.get("range"),
    ).toBe("All time");
    expect(command.output[0]).toContain("span environments");
    await expect(
      cli(request).run([...args, "--environment", "staging"]),
    ).rejects.toThrow("does not currently support");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("performs real HTTP reads through a local API with project authentication", async () => {
    const methods: string[] = [];
    const server = createServer((req, res) => {
      methods.push(req.method ?? "");
      if (req.headers.authorization !== `Bearer ${key}`) {
        res.writeHead(401);
        res.end();
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          req.url === "/v1/studio/context"
            ? context
            : { run, session, events, interrupts: [], updatedAt: date },
        ),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No server");
    const path = await configured();
    await saveConnections(
      {
        version: 1,
        profiles: [
          profile(
            "local-test",
            `http://127.0.0.1:${address.port}`,
            "http://localhost:6300",
          ),
        ],
      },
      path,
    );
    const command = cli(fetch);
    await command.run([
      "inspect",
      "http://localhost:6300/runs/run-1",
      "--config-home",
      path,
      "--home",
      path,
      "--json",
    ]);
    expect(methods).toEqual(["GET", "GET", "GET"]);
    expect(
      JSON.parse(command.output[0] ?? "").diagnostics.findings[0].evidence.error
        .code,
    ).toBe("PROVIDER_UNAVAILABLE");
  });
});
