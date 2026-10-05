import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerStudioEvalCommands } from "../src/studio/eval-command";
import {
  buildEvalDoctorReport,
  evalDoctorFailure,
  formatEvalDoctorReport,
} from "../src/studio/eval-doctor";

const manifest = {
  schemaVersion: 1 as const,
  studioJudging: true as const,
  suites: [
    {
      id: "catalog-smoke",
      cases: [
        {
          id: "price",
          steps: [{ message: "Price?", expect: { type: "answer" as const } }],
        },
      ],
    },
  ],
  responders: [],
  references: [],
};
const target = {
  id: "catalog",
  name: "Catalog",
  environment: "staging",
  manifest,
  error: null,
  revisions: { "catalog-smoke": "a".repeat(64) },
  diagnostic: null,
};
const data = {
  canRun: true,
  studioJudge: { id: "studio/test", version: "1" },
  targets: [target],
};
const options = { judge: "studio" as const, target: "catalog" };
const previousExitCode = process.exitCode;
afterEach(() => {
  vi.unstubAllEnvs();
  process.exitCode = previousExitCode;
});

const cli = (request: typeof fetch) => {
  const output: string[] = [];
  const command = new Command("studio");
  registerStudioEvalCommands(command, (value) => output.push(value), request);
  const overrides = (child: Command) => {
    child.exitOverride();
    child.configureOutput({ writeErr: () => {}, writeOut: () => {} });
    child.commands.forEach(overrides);
  };
  overrides(command);
  return {
    output,
    run: (args: string[] = []) =>
      command.parseAsync(
        [
          "evals",
          "doctor",
          "--api-url",
          "https://api.example.test",
          "--api-key-env",
          "DOCTOR_KEY",
          ...args,
        ],
        { from: "user" },
      ),
  };
};

describe("eval deployment doctor", () => {
  it.each([
    "studio",
    "app",
  ])("accepts explicit %s judging and checks that location", async (judge) => {
    vi.stubEnv("DOCTOR_KEY", "ktyx_test_doctor_private-secret");
    vi.stubEnv("KORTYX_CONNECTION", "");
    const request = vi.fn<typeof fetch>(async () => Response.json(data));
    const command = cli(request);
    await command.run(["--judge", judge, "--json"]);
    const report = JSON.parse(command.output[0] ?? "");
    expect(
      report.checks.find(
        (check: { id: string }) => check.id === "catalog:judge",
      ),
    ).toMatchObject({
      status: judge === "studio" ? "passed" : "failed",
      message: expect.stringContaining(`${judge} judge`),
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(judge === "studio" ? previousExitCode : 1);
  });
  it("rejects an unsupported judge location before any discovery request", async () => {
    const request = vi.fn<typeof fetch>();
    const command = cli(request);
    await expect(command.run(["--judge", "browser"])).rejects.toMatchObject({
      code: "commander.invalidArgument",
    });
    expect(request).not.toHaveBeenCalled();
    expect(command.output).toEqual([]);
  });
  it("checks scope, environment, authenticated manifest, suite and judge with one GET and no model/workflow calls", async () => {
    vi.stubEnv("DOCTOR_KEY", "ktyx_test_doctor_private-secret");
    vi.stubEnv("KORTYX_CONNECTION", "");
    const request = vi.fn<typeof fetch>(async () => Response.json(data));
    const command = cli(request);
    await command.run([
      "--target",
      "catalog",
      "--suite",
      "catalog-smoke",
      "--json",
    ]);
    expect(JSON.parse(command.output[0] ?? "")).toMatchObject({
      schemaVersion: 1,
      status: "passed",
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(String(request.mock.calls[0]?.[0])).toBe(
      "https://api.example.test/v1/studio/evals/targets",
    );
    expect(command.output.join()).not.toContain("private-secret");
    expect(command.output.join()).not.toContain("Price?");
    expect(process.exitCode).toBe(previousExitCode);
  });
  it("still reports all checks for a read-only key and fails without POSTing", async () => {
    vi.stubEnv("DOCTOR_KEY", "ktyx_test_doctor_private-secret");
    vi.stubEnv("KORTYX_CONNECTION", "");
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ ...data, canRun: false }),
    );
    const command = cli(request);
    await command.run();
    expect(command.output[0]).toContain("lacks eval:run");
    expect(command.output[0]).toContain("authenticated manifest valid");
    expect(process.exitCode).toBe(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([
    401, 403, 404, 500,
  ])("reports Studio HTTP %s without leaking arbitrary response bodies", async (status) => {
    vi.stubEnv("DOCTOR_KEY", "ktyx_test_doctor_private-secret");
    vi.stubEnv("KORTYX_CONNECTION", "");
    const command = cli(
      async () => new Response("Bearer LEAK-ME private SQL", { status }),
    );
    await command.run(["--json"]);
    expect(JSON.parse(command.output[0] ?? "").status).toBe("failed");
    expect(command.output[0]).not.toContain("LEAK-ME");
    expect(process.exitCode).toBe(1);
  });
  it("reports missing CLI credentials before networking", async () => {
    vi.stubEnv("DOCTOR_KEY", "");
    vi.stubEnv("KORTYX_CONNECTION", "");
    const request = vi.fn<typeof fetch>();
    const command = cli(request);
    await command.run(["--json"]);
    expect(JSON.parse(command.output[0] ?? "").checks[0].id).toBe(
      "studio_access",
    );
    expect(request).not.toHaveBeenCalled();
    expect(command.output[0]).toContain("Set DOCTOR_KEY");
  });
  it("does not mistake an unrelated target or environment for successful registration", () => {
    for (const selection of [
      { target: "missing" },
      { environment: "production" },
    ]) {
      const report = buildEvalDoctorReport(data, {
        judge: "studio",
        ...selection,
      });
      expect(report.status).toBe("failed");
      expect(
        report.checks.find((check) => check.id === "target_selection")?.status,
      ).toBe("failed");
      expect(report.checks).toHaveLength(3);
    }
  });
  it.each([
    ["endpoint_not_found", 404, "mounted and enabled"],
    ["endpoint_unauthorized", 401, "test actor"],
    ["endpoint_http_error", 502, "consumer and proxy logs"],
    ["endpoint_unreachable", undefined, "host.docker.internal"],
    ["manifest_invalid", undefined, "proxy returned HTML"],
  ] as const)("provides an actionable remedy for %s", (code, httpStatus, remedy) => {
    const report = buildEvalDoctorReport(
      {
        ...data,
        targets: [
          {
            ...target,
            manifest: null,
            diagnostic: { code, ...(httpStatus ? { httpStatus } : {}) },
          },
        ],
      },
      options,
    );
    expect(report.status).toBe("failed");
    expect(
      report.checks.find((check) => check.id === "catalog:manifest")?.remedy,
    ).toContain(remedy);
    expect(
      report.checks.find((check) => check.id === "catalog:judge")?.status,
    ).toBe("skipped");
  });
  it("does not diagnose service authentication when the project environment is blocked", () => {
    const report = buildEvalDoctorReport(
      {
        ...data,
        targets: [
          {
            ...target,
            manifest: null,
            diagnostic: { code: "environment_forbidden" },
          },
        ],
      },
      options,
    );
    expect(
      report.checks.find((check) => check.id === "catalog:environment")?.status,
    ).toBe("failed");
    expect(
      report.checks.find((check) => check.id === "catalog:manifest")?.status,
    ).toBe("skipped");
  });
  it("does not invent an environment or endpoint diagnosis against an older API", () => {
    const report = buildEvalDoctorReport(
      {
        ...data,
        targets: [
          {
            ...target,
            manifest: null,
            diagnostic: undefined,
            error: "LEAK-ME",
          },
        ],
      },
      options,
    );
    expect(report.status).toBe("failed");
    expect(
      report.checks.find((check) => check.id === "catalog:environment")?.status,
    ).toBe("skipped");
    expect(formatEvalDoctorReport(report)).toContain("Upgrade the Studio API");
    expect(formatEvalDoctorReport(report)).not.toContain("LEAK-ME");
  });
  it("checks explicit app judging independently of Studio configuration", () => {
    const app = {
      ...data,
      studioJudge: null,
      targets: [
        {
          ...target,
          manifest: { ...manifest, judge: { id: "app/test", version: "1" } },
        },
      ],
    };
    expect(buildEvalDoctorReport(app, { judge: "app" }).status).toBe("passed");
    expect(buildEvalDoctorReport(app, options).status).toBe("failed");
    expect(buildEvalDoctorReport(data, { judge: "app" }).status).toBe("failed");
  });
  it("rejects unsupported Studio judging, missing requested suites and empty catalogs", () => {
    expect(
      buildEvalDoctorReport(
        {
          ...data,
          targets: [
            { ...target, manifest: { ...manifest, studioJudging: undefined } },
          ],
        },
        options,
      ).status,
    ).toBe("failed");
    expect(
      buildEvalDoctorReport(data, { ...options, suite: "missing" }).status,
    ).toBe("failed");
    expect(
      buildEvalDoctorReport(
        {
          ...data,
          targets: [{ ...target, manifest: { ...manifest, suites: [] } }],
        },
        options,
      ).status,
    ).toBe("failed");
  });
  it("rejects an invalid judge before any discovery request", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(cli(request).run(["--judge", "other"])).rejects.toThrow(
      "Expected studio or app",
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("classifies database-check failures separately and safely handles unknown errors", () => {
    const report = buildEvalDoctorReport(
      {
        ...data,
        targets: [
          {
            ...target,
            manifest: null,
            diagnostic: { code: "environment_unavailable" },
          },
        ],
      },
      options,
    );
    expect(report.status).toBe("failed");
    expect(
      report.checks.find((check) => check.id === "catalog:manifest")?.status,
    ).toBe("skipped");
    expect(
      JSON.stringify(evalDoctorFailure(new Error("LEAK-ME"))),
    ).not.toContain("LEAK-ME");
  });
  it("removes terminal control characters from target metadata", () => {
    const text = formatEvalDoctorReport(
      buildEvalDoctorReport(
        { ...data, targets: [{ ...target, id: "catalog\u001b[31m" }] },
        { judge: "studio" },
      ),
    );
    expect(text).not.toContain("\u001b");
  });
  it("reports configuration readiness without claiming that a provider token or test actor was exercised", () => {
    const text = formatEvalDoctorReport(buildEvalDoctorReport(data, options));
    expect(text).toContain("Run one representative suite");
    expect(text).toContain(
      "Consumer GET discovery may run app-owned authentication logic",
    );
  });
});
