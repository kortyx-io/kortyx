import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveConnections } from "../src/connections";
import { defaultStudioRuntime, runStudioCommand } from "../src/studio/command";
import { StudioPromptClient } from "../src/studio/prompt-client";
import { registerStudioPromptCommands } from "../src/studio/prompt-command";

const key = "ktyx_test_cli_prompts-test-key";
const id = "10000000-0000-4000-8000-000000000253";
const hash = "a".repeat(64);
const content = {
  format: "system-user",
  messages: [
    { role: "system", content: "Classify" },
    { role: "user", content: "{{message}}" },
  ],
  variablesSchema: {
    type: "object",
    properties: { message: { type: "string" } },
  },
  configSchema: { type: "object" },
  config: {},
  dependencies: [],
};
const detail = {
  asset: {
    id,
    key: "classify",
    name: "Classify",
    categoryId: null,
    latestVersion: 201,
    revision: 201,
    archived: false,
    updatedAt: "2026-10-01T00:00:00Z",
    assignments: [],
  },
  versions: [
    {
      id: "classify",
      version: 1,
      hash,
      content,
      promptId: id,
      note: "Initial",
      author: "author",
      createdAt: "2026-10-01T00:00:00Z",
      origin: null,
    },
  ],
  versionsNextCursor: null,
  draft: null,
  draftBase: null,
  draftRevision: 0,
  evidence: [],
  usage: [],
  activity: [],
  policies: [],
};
const homes: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const home of homes.splice(0))
    await rm(home, { recursive: true, force: true });
});
describe("Studio prompt CLI", () => {
  it("supports reviewed editing, lifecycle actions, individual tests and replayable cross-deployment plans", async () => {
    const home = await mkdtemp(join(tmpdir(), "kortyx-prompts-commands-"));
    homes.push(home);
    vi.stubEnv("PROMPT_CLI_TEST_KEY", key);
    const profiles = ["source", "destination"].map((name) => ({
      name,
      apiUrl: `https://${name}.example`,
      apiKeyEnv: "PROMPT_CLI_TEST_KEY",
      organization: "Test",
      project: "Test",
      projectId: id,
    }));
    await saveConnections({ version: 1, profiles }, home);
    const file = join(home, "content.json"),
      bundleFile = join(home, "bundle.json"),
      planFile = join(home, "plan.json"),
      actionFile = join(home, "action.json");
    await writeFile(file, JSON.stringify(content));
    await writeFile(
      actionFile,
      JSON.stringify({ action: "group-create", name: "Experiment" }),
    );
    const bundle = {
      schemaVersion: 1,
      origin: { apiUrl: "https://source.example", projectId: id },
      prompts: [
        {
          key: "classify",
          name: "Classify",
          versions: [{ ...detail.versions[0], id: "classify" }],
        },
      ],
      groups: [],
    };
    const mapping = [
      {
        sourceKey: "classify",
        sourceVersion: 1,
        key: "classify",
        promptId: id,
        version: 1,
        hash,
      },
    ];
    const plan = {
      id,
      bundleHash: hash,
      mapping,
      expiresAt: "2026-10-09T00:00:00Z",
      assignmentsChanged: false,
    };
    const current = {
      ...detail,
      asset: { ...detail.asset, latestVersion: 1 },
      versions: [
        detail.versions[0],
        {
          ...detail.versions[0],
          version: 2,
          content: { ...content, config: { temperature: 0.5 } },
        },
      ],
    };
    const target = {
      id: "application",
      name: "Application",
      environment: "production",
      error: null,
      manifest: {
        schemaVersion: 1,
        suites: [
          {
            id: "intent",
            cases: [
              {
                id: "support",
                steps: [{ message: "Help", expect: { type: "answer" } }],
              },
            ],
          },
        ],
        responders: [],
        references: [],
      },
      revisions: { intent: hash },
    };
    const request = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/targets"))
        return Response.json({ canRun: true, targets: [target] });
      if (url.pathname.endsWith("/actions"))
        return Response.json({
          id,
          action: JSON.parse(String(init?.body)).action,
        });
      if (url.pathname.endsWith("/export")) return Response.json(bundle);
      if (url.pathname.endsWith("/plan")) return Response.json(plan);
      if (url.pathname.endsWith("/apply"))
        return Response.json({ mapping: [...mapping, ...mapping] });
      if (url.pathname.endsWith("/runs")) return Response.json({ id });
      if (url.pathname.includes("/assets/")) return Response.json(current);
      return Response.json({
        schemaVersion: 1,
        assets: [current.asset],
        categories: [],
        groups: [],
        totalCount: 1,
        nextCursor: null,
        permissions: {
          edit: true,
          promote: true,
          review: true,
          settings: true,
        },
      });
    });
    const execute = async (args: string[], json = true) => {
      const output: string[] = [];
      const command = new Command("studio").exitOverride();
      command.configureOutput({ writeErr: () => {} });
      registerStudioPromptCommands(
        command,
        (value) => output.push(value),
        request,
      );
      await command.parseAsync(
        [
          "prompts",
          ...args,
          "--connection",
          "source",
          "--config-home",
          home,
          ...(json ? ["--json"] : []),
        ],
        { from: "user" },
      );
      return JSON.parse(output[0]!);
    };
    await execute(["list"]);
    await execute([
      "list",
      "--search",
      "Classify",
      "--cursor",
      "100",
      "--archived",
    ]);
    await execute(["get", "classify"], false);
    await execute(["get", "classify", "--version", "1", "--file", file]);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(content);
    await execute(["versions", "classify"]);
    await execute(["diff", "classify", "1", "2"]);
    for (const category of [[], ["--category", id, "--idempotency-key", id]])
      await execute([
        "create",
        "new-key",
        "--file",
        file,
        "--name",
        "New prompt",
        "--note",
        "Initial",
        ...category,
      ]);
    for (const retry of [[], ["--idempotency-key", id]])
      await execute([
        "edit",
        "classify",
        "--file",
        file,
        "--note",
        "Reviewed change",
        "--base-version",
        "1",
        "--expected-hash",
        hash,
        ...retry,
      ]);
    await execute(["action", actionFile]);
    for (const action of ["promote", "rollback"]) {
      await execute([
        action,
        "classify",
        "--version",
        "1",
        "--environment",
        "production",
        "--expected-revision",
        "0",
      ]);
      await execute([
        action,
        "classify",
        "--version",
        "1",
        "--environment",
        "production",
        "--expected-revision",
        "1",
        "--exception-reason",
        "Audited bootstrap",
      ]);
    }
    for (const action of ["archive", "restore"])
      await execute([action, "classify", "--expected-revision", "1"]);
    await execute([
      "test",
      "classify",
      "--version",
      "1",
      "--target",
      "application",
      "--suite",
      "intent",
    ]);
    await execute([
      "test",
      "classify",
      "--version",
      "1",
      "--target",
      "application",
      "--suite",
      "intent",
      "--case",
      "support",
    ]);
    await expect(
      execute([
        "test",
        "classify",
        "--version",
        "1",
        "--target",
        "missing",
        "--suite",
        "intent",
      ]),
    ).rejects.toThrow("not found");
    await execute([
      "export",
      "classify",
      "--file",
      bundleFile,
      "--version",
      "1",
    ]);
    await execute(["export", "classify", "--history", "--groups"]);
    await execute(["export", "classify"]);
    await execute(["import", bundleFile]);
    await execute([
      "import",
      bundleFile,
      "--append",
      "--rename",
      "classify=classification",
      "--plan-file",
      planFile,
      "--apply",
    ]);
    expect(JSON.parse(await readFile(planFile, "utf8"))).toMatchObject(plan);
    await execute(["apply", planFile]);
    await execute([
      "copy",
      "classify",
      "--from",
      "source",
      "--to",
      "destination",
      "--version",
      "1",
      "--apply",
    ]);
    await execute([
      "copy",
      "classify",
      "--from",
      "source",
      "--to",
      "destination",
      "--history",
      "--groups",
    ]);
    for (const args of [
      ["get", "classify", "--version", "3"],
      ["diff", "classify", "1", "3"],
      ["diff", "classify", "3", "1"],
      ["get", "classify", "--version", "0"],
      ["diff", "classify", "NaN", "1"],
      ["export", "classify", "other", "--version", "1"],
      ["export", "classify", "--version", "1", "--history"],
      [
        "copy",
        "classify",
        "other",
        "--from",
        "source",
        "--to",
        "destination",
        "--version",
        "1",
      ],
      [
        "copy",
        "classify",
        "--from",
        "source",
        "--to",
        "destination",
        "--version",
        "1",
        "--history",
      ],
      ["import", bundleFile, "--rename", "wrong"],
      ["import", bundleFile, "--rename", "a=b=c"],
    ])
      await expect(execute(args)).rejects.toThrow();
    const sent = request.mock.calls.map(([input, init]) => ({
      url: new URL(String(input)),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: init?.headers,
    }));
    expect(sent).toContainEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          note: "Reviewed change",
          baseVersion: 1,
          expectedHash: hash,
        }),
      }),
    );
    expect(sent).toContainEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          caseIds: ["support"],
          promptSelection: { type: "single", id, version: 1 },
        }),
      }),
    );
    expect(sent).toContainEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          conflicts: "append",
          rename: { classify: "classification" },
        }),
      }),
    );
    expect(
      sent.some(
        (call) =>
          call.url.hostname === "destination.example" &&
          call.url.pathname.endsWith("/apply"),
      ),
    ).toBe(true);
    expect(JSON.stringify(plan)).not.toContain(key);
  });
  it("bounds remote responses and exposes safe prompt error codes without leaking bodies", async () => {
    const responses = [
      Response.json(
        { error: "PROMPT_PROMOTION_BLOCKED", message: key },
        { status: 409 },
      ),
      Response.json(
        { error: "untrusted error", message: key },
        { status: 400 },
      ),
      new Response("not JSON", { status: 500 }),
      new Response(null, { status: 403 }),
      new Response("x".repeat(9000), { status: 500 }),
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"error":"unsafe"}'));
          },
          cancel() {
            throw new Error("cancel failed");
          },
        }),
        { status: 500 },
      ),
      new Response(new Uint8Array(20 * 1024 * 1024 + 1)),
    ];
    for (const [index, response] of responses.entries()) {
      const client = new StudioPromptClient(
        "https://source.example",
        key,
        async () => response,
      );
      await expect(client.get("classify")).rejects.toMatchObject({
        code:
          index === 0
            ? "PROMPT_PROMOTION_BLOCKED"
            : index === 6
              ? "response_too_large"
              : "api_error",
      });
    }
  });
  it("verifies each exact migrated version through an authenticated destination read", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(detail));
    const client = new StudioPromptClient(
      "https://destination.example",
      key,
      request,
      { projectId: id },
    );
    await expect(
      client.verifyTransfer({ mapping: [{ promptId: id, version: 1, hash }] }),
    ).resolves.toMatchObject({ verified: true });
    const url = new URL(String(request.mock.calls[0]?.[0]));
    expect(url.searchParams.get("version")).toBe("1");
    expect(url.searchParams.has("lookup")).toBe(false);
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: { authorization: `Bearer ${key}`, "x-kortyx-project-id": id },
      redirect: "error",
    });
    request.mockResolvedValue(Response.json(detail));
    await expect(
      client.verifyTransfer({
        mapping: [{ promptId: id, version: 1, hash: "b".repeat(64) }],
      }),
    ).rejects.toThrow("verification failed");
  });
  it("reads a paginated history by key and exposes the next cursor", async () => {
    vi.stubEnv("PROMPT_CLI_TEST_KEY", key);
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(detail));
    const output: string[] = [];
    const command = new Command("studio");
    registerStudioPromptCommands(command, (text) => output.push(text), request);
    await command.parseAsync(
      [
        "prompts",
        "versions",
        "classify",
        "--cursor",
        "200",
        "--api-url",
        "https://source.example",
        "--api-key-env",
        "PROMPT_CLI_TEST_KEY",
        "--json",
      ],
      { from: "user" },
    );
    expect(
      new URL(String(request.mock.calls[0]?.[0])).searchParams.get(
        "versionsCursor",
      ),
    ).toBe("200");
    expect(
      new URL(String(request.mock.calls[0]?.[0])).searchParams.get("lookup"),
    ).toBe("key");
    expect(JSON.parse(output[0]!)).toMatchObject({
      nextCursor: null,
      versions: [{ version: 1 }],
    });
    expect(JSON.parse(output[0]!).versions[0]).not.toHaveProperty("content");
  });
  it("validates content offline before any connection or network request", async () => {
    const home = await mkdtemp(join(tmpdir(), "kortyx-prompts-cli-"));
    homes.push(home);
    const file = join(home, "content.json");
    await writeFile(file, JSON.stringify(content));
    const request = vi.fn<typeof fetch>();
    const output: string[] = [];
    await runStudioCommand(["prompts", "validate", file, "--json"], {
      ...defaultStudioRuntime,
      request,
      log: (text) => {
        if (text !== undefined) output.push(text);
      },
    });
    expect(JSON.parse(output[0]!)).toMatchObject({
      valid: true,
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(request).not.toHaveBeenCalled();
  });
});
