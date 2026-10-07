import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveConnections } from "../src/connections";
import { defaultStudioRuntime, runStudioCommand } from "../src/studio/command";
import {
  parseEvalRunTarget,
  StudioEvalClient,
} from "../src/studio/eval-client";
import { registerStudioEvalCommands } from "../src/studio/eval-command";

const key = "ktyx_test_studio_testsecret";
const id = "10000000-0000-4000-8000-000000000252";
const revision = "a".repeat(64);
const suite = {
  id: "jobs",
  name: "Jobs",
  cases: [
    {
      id: "ambiguity",
      params: { private: "business input" },
      steps: [
        {
          message: "private prompt",
          expect: { type: "answer", criteria: ["private criterion"] },
        },
      ],
    },
  ],
};
const target = {
  id: "hiring",
  name: "Hiring",
  environment: "staging",
  error: null,
  manifest: {
    schemaVersion: 1,
    suites: [suite],
    responders: [],
    references: [],
  },
  revisions: { jobs: revision },
};
const date = "2026-10-01T00:00:00.000Z";
const summary = {
  id,
  targetId: target.id,
  targetName: target.name,
  environment: "staging",
  suiteId: suite.id,
  suiteRevision: revision,
  status: "passed",
  createdAt: date,
  startedAt: date,
  endedAt: date,
  error: null,
  cancelRequestedAt: null,
  counts: { passed: 1, failed: 0, error: 0, cancelled: 0 },
};
const detail = {
  run: {
    ...summary,
    request: { repetitions: 1 },
    suite,
    events: [],
    result: {
      id,
      suiteId: suite.id,
      suiteRevision: revision,
      suite,
      startedAt: date,
      durationMs: 10,
      status: "passed",
      counts: summary.counts,
      errors: [],
      cases: [
        {
          caseId: "ambiguity",
          repetition: 1,
          sessionId: "session-1",
          status: "passed",
          durationMs: 10,
          errors: [],
          steps: [
            {
              index: 0,
              input: { message: "private prompt" },
              expectation: suite.cases[0]?.steps[0]?.expect,
              observation: {
                type: "answer",
                text: "private answer",
                structured: [
                  { dataType: "custom", data: { resumeToken: "never-print" } },
                ],
              },
              status: "passed",
              criteria: [
                {
                  id: "description",
                  text: "private criterion",
                  passed: true,
                  reason: "private reasoning",
                  evidence: ["private answer"],
                },
              ],
            },
          ],
        },
      ],
    },
  },
};
const evaluationSummary = {
  id,
  name: "All suites",
  targetId: target.id,
  targetName: target.name,
  environment: "staging",
  selection: "all",
  metadata: { source: "manual" },
  status: "passed",
  createdAt: date,
  startedAt: date,
  endedAt: date,
  cancelRequestedAt: null,
  suiteCount: 1,
  completedSuites: 1,
  totalAttempts: 1,
  completedAttempts: 1,
  counts: summary.counts,
};
const evaluationResults = {
  run: { ...evaluationSummary, suites: [detail.run] },
};
const homes: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  process.exitCode = undefined;
  vi.useRealTimers();
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});
async function configured(
  environment: string | null = "staging",
  studioUrl: string | null = "https://studio.example.test",
) {
  const home = await mkdtemp(join(tmpdir(), "kortyx-eval-cli-"));
  homes.push(home);
  vi.stubEnv("KORTYX_EVAL_KEY", key);
  vi.stubEnv("KORTYX_CONNECTION", "");
  await saveConnections(
    {
      version: 1,
      profiles: [
        {
          name: "staging",
          apiUrl: "https://api.example.test",
          apiKeyEnv: "KORTYX_EVAL_KEY",
          project: "Hiring",
          organization: "Example",
          ...(environment ? { environment } : {}),
          ...(studioUrl ? { studioUrl } : {}),
        },
      ],
    },
    home,
  );
  return ["--connection", "staging", "--config-home", home, "--home", home];
}
const mockFetch = (targets: unknown[] = [target], canRun = true) =>
  vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.includes("/evaluations/") && !path.endsWith("/cancel"))
      return new Response(
        JSON.stringify(
          path.endsWith("/results")
            ? evaluationResults
            : { run: { ...evaluationSummary, suites: [summary] } },
        ),
      );
    if (path.endsWith("/evaluations") && init?.method !== "POST")
      return new Response(JSON.stringify({ runs: [evaluationSummary] }));
    const body = path.endsWith("/targets")
      ? { canRun, targets }
      : path.endsWith("/cancel")
        ? { ok: true }
        : init?.method === "POST"
          ? { id }
          : path.endsWith("/runs")
            ? { runs: [summary] }
            : detail;
    return new Response(JSON.stringify(body), {
      status: init?.method === "POST" && !path.endsWith("/cancel") ? 202 : 200,
    });
  });
const cli = (request: typeof fetch) => {
  const output: string[] = [];
  const command = new Command("studio");
  registerStudioEvalCommands(command, (text) => output.push(text), request);
  const override = (child: Command) => {
    child.exitOverride();
    child.configureOutput({ writeErr: () => {}, writeOut: () => {} });
    child.commands.forEach(override);
  };
  override(command);
  return {
    output,
    run: (argv: string[]) =>
      command.parseAsync(["evals", ...argv], { from: "user" }),
  };
};

describe("Studio eval CLI", () => {
  it("wires evals into the public studio command with its injected transport", async () => {
    const args = await configured();
    const output: string[] = [];
    await runStudioCommand(["evals", "suites", "list", ...args], {
      ...defaultStudioRuntime,
      request: mockFetch(),
      log: (text) => output.push(text ?? ""),
    });
    expect(JSON.parse(output[0] ?? "").targets[0].id).toBe("hiring");
  });
  it("discovers summaries without business data, and explicitly reads definitions", async () => {
    const args = await configured();
    const command = cli(
      mockFetch([
        target,
        { ...target, id: "down", manifest: null },
        { ...target, id: "dev", environment: "development" },
      ]),
    );
    await command.run(["suites", "list", ...args, "--json"]);
    expect(JSON.parse(command.output[0] ?? "").targets).toHaveLength(2);
    expect(command.output[0]).not.toContain("private");
    await command.run(["suites", "get", "jobs", ...args]);
    expect(JSON.parse(command.output[1] ?? "").suite).toEqual({
      id: "jobs",
      name: "Jobs",
      caseIds: ["ambiguity"],
    });
    await command.run([
      "suites",
      "get",
      "jobs",
      ...args,
      "--include-content",
      "--json",
    ]);
    expect(command.output[2]).toContain("private prompt");
  });
  it("enqueues once with discovered revision, selected cases, repetitions and URL", async () => {
    const args = await configured();
    const request = mockFetch();
    const command = cli(request);
    await command.run([
      "runs",
      "start",
      "jobs",
      ...args,
      "--case",
      "ambiguity",
      "--repetitions",
      "3",
      "--concurrency",
      "2",
      "--json",
    ]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { authorization: `Bearer ${key}` },
    });
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
      targetId: "hiring",
      judge: "studio",
      selection: "selected",
      suites: [
        { suiteId: "jobs", suiteRevision: revision, caseIds: ["ambiguity"] },
      ],
      metadata: { source: "manual" },
      repetitions: 3,
      concurrency: 2,
    });
    expect(JSON.parse(command.output[0] ?? "")).toEqual({
      schemaVersion: 1,
      connection: "staging",
      id,
      status: "queued",
      studioUrl: `https://studio.example.test/evals/evaluations/${id}`,
    });
    expect(command.output[0]).not.toContain(key);
  });
  it("starts all cases with defaults and no browser URL", async () => {
    const args = await configured(null, null);
    const request = mockFetch();
    const command = cli(request);
    await command.run(["runs", "start", "jobs", ...args]);
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
      targetId: "hiring",
      judge: "studio",
      selection: "selected",
      suites: [{ suiteId: "jobs", suiteRevision: revision }],
      metadata: { source: "manual" },
      repetitions: 1,
      concurrency: 1,
    });
    expect(JSON.parse(command.output[0] ?? "").studioUrl).toBeNull();
  });
  it("lets CI explicitly choose the code judge and rejects invalid selections before networking", async () => {
    const args = await configured(null, null);
    const request = mockFetch();
    const command = cli(request);
    await command.run(["runs", "start", "jobs", "--judge", "app", ...args]);
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body)).judge).toBe(
      "app",
    );
    const invalidRequest = mockFetch();
    await expect(
      cli(invalidRequest).run([
        "runs",
        "start",
        "jobs",
        "--judge",
        "unknown",
        ...args,
      ]),
    ).rejects.toThrow("Expected studio or app");
    expect(invalidRequest).not.toHaveBeenCalled();
  });
  it("filters discovery explicitly and requires an unambiguous target", async () => {
    const args = await configured();
    const command = cli(mockFetch([target, { ...target, id: "other" }]));
    await expect(
      command.run(["runs", "start", "jobs", ...args]),
    ).rejects.toThrow("Select one available application");
    await command.run([
      "runs",
      "start",
      "jobs",
      ...args,
      "--target",
      "other",
      "--environment",
      "staging",
    ]);
    await expect(
      command.run(["runs", "start", "missing", ...args]),
    ).rejects.toThrow("available");
  });
  it("refuses read-only execution before a POST", async () => {
    const args = await configured();
    const request = mockFetch([target], false);
    await expect(
      cli(request).run(["runs", "start", "jobs", ...args]),
    ).rejects.toThrow("eval:run");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([
    { cases: ["missing"] },
    { cases: ["ambiguity", "ambiguity"] },
  ])("refuses invalid case selection $cases", async ({ cases }) => {
    const args = await configured();
    const request = mockFetch();
    await expect(
      cli(request).run([
        "runs",
        "start",
        "jobs",
        ...args,
        ...cases.flatMap((id) => ["--case", id]),
      ]),
    ).rejects.toThrow("unique existing");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("caps total attempts and validates numeric limits", async () => {
    const args = await configured();
    const many = {
      ...target,
      manifest: {
        ...target.manifest,
        suites: [
          {
            ...suite,
            cases: Array.from({ length: 6 }, (_, i) => ({
              ...suite.cases[0],
              id: `case-${i}`,
            })),
          },
        ],
      },
    };
    await expect(
      cli(mockFetch([many])).run([
        "runs",
        "start",
        "jobs",
        ...args,
        "--repetitions",
        "20",
      ]),
    ).rejects.toThrow("100 attempts per suite");
    for (const value of ["0", "21", "1.5", "no"])
      await expect(
        cli(mockFetch()).run([
          "runs",
          "start",
          "jobs",
          ...args,
          "--repetitions",
          value,
        ]),
      ).rejects.toThrow("integer");
  });
  it("returns verdicts without content and redacts continuation credentials even when content is included", async () => {
    const args = await configured();
    const command = cli(mockFetch());
    await command.run(["runs", "get", id, ...args, "--json"]);
    expect(
      JSON.parse(command.output[0] ?? "").run.suites[0].caseResults[0].steps[0]
        .criteria,
    ).toEqual([{ id: "description", passed: true }]);
    expect(command.output[0]).not.toContain("private");
    await command.run([
      "runs",
      "get",
      `https://studio.example.test/evals/runs/${id}?token=never-print`,
      ...args,
      "--include-content",
    ]);
    expect(command.output[1]).toContain("private answer");
    expect(command.output[1]).not.toContain("never-print");
  });
  it("reads unfinished runs and filters latest history", async () => {
    const args = await configured();
    const request = vi.fn<typeof fetch>().mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("/evaluations")
              ? {
                  runs: [
                    evaluationSummary,
                    { ...evaluationSummary, environment: "development" },
                  ],
                }
              : {
                  run: {
                    ...evaluationSummary,
                    suites: [{ ...detail.run, result: null }],
                  },
                },
          ),
        ),
    );
    const command = cli(request);
    await command.run(["runs", "list", ...args]);
    expect(JSON.parse(command.output[0] ?? "").runs).toHaveLength(1);
    await command.run([
      "runs",
      "list",
      ...args,
      "--environment",
      "development",
    ]);
    expect(JSON.parse(command.output[1] ?? "").runs[0].environment).toBe(
      "development",
    );
    await command.run(["runs", "get", id, ...args]);
    expect(
      JSON.parse(command.output[2] ?? "").run.suites[0].caseResults,
    ).toBeUndefined();
  });
  it("can read unfiltered history without an environment default", async () => {
    const args = await configured(null);
    const command = cli(mockFetch());
    await command.run(["runs", "list", ...args]);
    expect(JSON.parse(command.output[0] ?? "").runs).toHaveLength(1);
  });
  it("cancels through its fixed endpoint and rejects unmapped URLs without sending credentials", async () => {
    const args = await configured();
    const request = mockFetch();
    const command = cli(request);
    await command.run(["runs", "cancel", id, ...args, "--json"]);
    expect(String(request.mock.calls[0]?.[0])).toBe(
      `https://api.example.test/v1/studio/evals/evaluations/${id}/cancel`,
    );
    expect(JSON.parse(command.output[0] ?? "")).toMatchObject({ id, ok: true });
    await expect(
      command.run([
        "runs",
        "get",
        `https://evil.test/evals/runs/${id}`,
        ...args,
      ]),
    ).rejects.toThrow("does not match");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("runs all suites with deployment metadata and returns detailed results on demand", async () => {
    const args = await configured();
    const request = mockFetch();
    const command = cli(request);
    await command.run([
      "runs",
      "start",
      "--all",
      "--target",
      "hiring",
      "--source",
      "deployment",
      "--commit",
      "abc123",
      "--deployment-url",
      "https://ci.example/jobs/1",
      "--idempotency-key",
      "deploy-1",
      ...args,
      "--json",
    ]);
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toMatchObject({
      selection: "all",
      suites: [{ suiteId: "jobs", suiteRevision: revision }],
      metadata: {
        source: "deployment",
        commit: "abc123",
        deploymentUrl: "https://ci.example/jobs/1",
      },
      idempotencyKey: "deploy-1",
    });
    await command.run([
      "runs",
      "get",
      `https://studio.example.test/evals/evaluations/${id}`,
      ...args,
      "--include-content",
      "--json",
    ]);
    expect(command.output[1]).toContain("private answer");
    expect(command.output[1]).not.toContain(key);
  });
  it("pins repeated suite selections and waits for final verdicts after launch", async () => {
    const args = await configured();
    const extra = { ...suite, id: "safety" };
    const request = mockFetch([
      {
        ...target,
        manifest: { ...target.manifest, suites: [suite, extra] },
        revisions: { jobs: revision, safety: revision },
      },
    ]);
    const command = cli(request);
    await command.run([
      "runs",
      "start",
      "--suite",
      "jobs",
      "--suite",
      "safety",
      "--wait",
      ...args,
      "--json",
    ]);
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toMatchObject({
      selection: "selected",
      suites: [
        { suiteId: "jobs", suiteRevision: revision },
        { suiteId: "safety", suiteRevision: revision },
      ],
    });
    expect(process.exitCode).toBe(0);
    expect(JSON.parse(command.output[0] ?? "").run.status).toBe("passed");
    expect(command.output[0]).not.toContain("private answer");
    await expect(
      cli(request).run([
        "runs",
        "start",
        "--suite",
        "jobs",
        "--suite",
        "safety",
        "--case",
        "ambiguity",
        ...args,
      ]),
    ).rejects.toThrow("exactly one selected suite");
  });
  it.each([
    ["passed", 0],
    ["failed", 1],
    ["error", 2],
    ["cancelled", 130],
  ] as const)("wait returns %s with exit code %s", async (status, code) => {
    const args = await configured();
    const request = vi.fn<typeof fetch>(
      async (url) =>
        new Response(
          JSON.stringify({
            run: {
              ...evaluationSummary,
              status,
              suites: String(url).endsWith("/results")
                ? [detail.run]
                : [summary],
            },
          }),
        ),
    );
    const command = cli(request);
    await command.run(["runs", "wait", id, ...args, "--json"]);
    expect(process.exitCode).toBe(code);
    expect(JSON.parse(command.output[0] ?? "").run.status).toBe(status);
    expect(command.output[0]).not.toContain("private");
  });
  it("does not cancel when waiting times out and allows a later read", async () => {
    const args = await configured();
    const request = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            run: { ...evaluationSummary, status: "running", suites: [summary] },
          }),
        ),
    );
    const command = cli(request);
    const pending = command.run([
      "runs",
      "wait",
      id,
      ...args,
      "--timeout",
      "1",
    ]);
    const rejection = expect(pending).rejects.toThrow("still running");
    await rejection;
    expect(process.exitCode).toBe(2);
    expect(request.mock.calls.every(([, init]) => init?.method === "GET")).toBe(
      true,
    );
  });
  it("reads old suite-run links when the parent is absent", async () => {
    const args = await configured();
    const request = vi.fn<typeof fetch>(async (url) =>
      String(url).includes("/evaluations/")
        ? new Response("missing", { status: 404 })
        : new Response(JSON.stringify(detail)),
    );
    const command = cli(request);
    await command.run(["runs", "get", id, ...args, "--json"]);
    expect(
      JSON.parse(command.output[0] ?? "").run.caseResults[0].steps[0]
        .criteria[0].passed,
    ).toBe(true);
  });
  it("never retries a start rejected by a changed suite", async () => {
    const args = await configured();
    const request = mockFetch()
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ canRun: true, targets: [target] })),
      )
      .mockImplementationOnce(
        async () => new Response("private server error", { status: 409 }),
      );
    await expect(
      cli(request).run(["runs", "start", "jobs", ...args]),
    ).rejects.toThrow("HTTP 409");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
describe("eval endpoint validation", () => {
  it.each([
    "broken",
    "../runs",
    "https://",
    `ftp://studio.test/evals/runs/${id}`,
    `https://u:p@studio.test/evals/runs/${id}`,
    `https://studio.test/runs/${id}`,
    "https://studio.test/evals/runs/not-uuid",
  ])("rejects %s", (input) =>
    expect(() => parseEvalRunTarget(input)).toThrow());
  it("strips query and fragment from valid locators", () =>
    expect(
      parseEvalRunTarget(`https://studio.test/evals/runs/${id}?secret=x#x`),
    ).toEqual({ id, url: `https://studio.test/evals/runs/${id}` }));
  it("validates request limits before making a call", async () => {
    const request = mockFetch();
    const client = new StudioEvalClient(
      "https://api.example.test",
      key,
      request,
    );
    expect(() =>
      client.start({
        targetId: "hiring",
        suiteId: "jobs",
        suiteRevision: "bad",
      }),
    ).toThrow("Invalid suite");
    expect(() => client.run("../runs")).toThrow("UUID");
    expect(() => client.cancel("../runs")).toThrow("UUID");
    expect(request).not.toHaveBeenCalled();
  });
});
