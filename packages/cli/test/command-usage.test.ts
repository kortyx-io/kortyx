import { KortyxError } from "@kortyx/core/errors";
import {
  createUsageTelemetry,
  type UsageRecord,
} from "@kortyx/usage-telemetry";
import { configureUsageTelemetry } from "@kortyx/usage-telemetry/node";
import { Command, CommanderError } from "commander";
import { afterEach, expect, it, vi } from "vitest";
import { runCliWithUsage } from "../src/command-usage";

const dispose: (() => void)[] = [];
afterEach(() => {
  dispose.splice(0).forEach((fn) => {
    fn();
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function fixture() {
  const records: UsageRecord[] = [];
  const usage = createUsageTelemetry({
    context: { product: "cli", component: "cli", version: "1.0.0" },
    identity: () => "ae037bc5-7773-42b7-9664-26328dcd121c",
    transport: async (batch) => {
      records.push(...batch);
    },
  });
  dispose.push(() => usage.dispose());
  const program = new Command("kortyx")
    .exitOverride()
    .configureOutput({ writeOut() {}, writeErr() {} });
  const action = vi.fn();
  program
    .command("studio")
    .command("diagnostics")
    .command("show <id>")
    .alias("inspect")
    .option("--json")
    .option("--dry-run")
    .option("--api-key <secret>")
    .action(action);
  return { records, usage, program, action };
}
it("counts one invocation from declared command names and excludes IDs, credentials and arguments", async () => {
  const f = fixture();
  await runCliWithUsage(
    f.program,
    [
      "studio",
      "diagnostics",
      "inspect",
      "customer-secret-id",
      "--api-key",
      "customer-secret-key",
      "--json",
      "--dry-run",
    ],
    { usage: f.usage, exitCode: () => 0 },
  );
  expect(f.action).toHaveBeenCalledOnce();
  expect(f.records).toHaveLength(1);
  expect(f.records[0]).toMatchObject({
    product: "cli",
    outcome: "success",
    count: 1,
    properties: {
      measurement_kind: "invocation",
      cli_command: "studio.diagnostics",
      cli_action: "show",
      phase: "execution",
      json_output: true,
      dry_run: true,
    },
  });
  expect(JSON.stringify(f.records)).not.toContain("customer-secret");
});

it.each([
  "overview",
  "attempts",
  "turn",
  "evidence",
])("counts bounded eval %s without capturing identifiers or content", async (action) => {
  const f = fixture();
  f.program.commands[0]
    ?.command("evals")
    .command(`${action} <id>`)
    .action(() => {});
  await runCliWithUsage(
    f.program,
    ["studio", "evals", action, "customer-secret-id"],
    { usage: f.usage },
  );
  expect(f.records[0]).toMatchObject({
    properties: { cli_command: "studio.evals", cli_action: action },
  });
  expect(JSON.stringify(f.records)).not.toContain("customer-secret");
});
it.each([
  [2, "failed"],
  ["2", "failed"],
  [130, "cancelled"],
  [1, "failed"],
  ["0", "success"],
  [undefined, "success"],
])("preserves exit code %s semantics", async (code, outcome) => {
  const f = fixture();
  await runCliWithUsage(
    f.program,
    ["studio", "diagnostics", "show", "secret"],
    { usage: f.usage, exitCode: () => code },
  );
  expect(f.records[0]?.outcome).toBe(outcome);
  if (outcome === "failed")
    expect(f.records[0]?.properties.error_code).toBe("CLI_EXIT_FAILED");
});
it("classifies parse errors without recording unknown arguments and rethrows the same error", async () => {
  const f = fixture();
  const error = await runCliWithUsage(f.program, ["customer-secret"], {
    usage: f.usage,
  }).catch((e) => e);
  expect(error).toBeInstanceOf(CommanderError);
  expect(f.records[0]).toMatchObject({
    outcome: "failed",
    properties: {
      cli_command: "unknown",
      cli_action: "unknown",
      phase: "parse",
      error_code: "CLI_ARGUMENT_INVALID",
    },
  });
  expect(JSON.stringify(f.records)).not.toContain("customer-secret");
});
it("records help while preserving Commander's zero-exit control flow", async () => {
  const f = fixture();
  await expect(
    runCliWithUsage(f.program, ["--help"], { usage: f.usage }),
  ).rejects.toMatchObject({ exitCode: 0 });
  expect(f.records[0]).toMatchObject({
    outcome: "success",
    properties: { cli_command: "help", cli_action: "help", phase: "parse" },
  });
});
it("preserves original execution errors when flush rejects", async () => {
  const f = fixture();
  const error = new Error("customer-secret");
  f.action.mockRejectedValueOnce(error);
  const flush = vi.fn(async () => {
    throw new Error("offline");
  });
  await expect(
    runCliWithUsage(f.program, ["studio", "diagnostics", "show", "secret"], {
      usage: f.usage,
      flush,
    }),
  ).rejects.toBe(error);
  await f.usage.flush();
  expect(f.records[0]?.outcome).toBe("failed");
  expect(flush).toHaveBeenCalledOnce();
  expect(JSON.stringify(f.records)).not.toContain("customer-secret");
});
it("limits time spent waiting for optional transports", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const flush = vi.fn(() => new Promise<void>(() => {}));
  const running = runCliWithUsage(
    f.program,
    ["studio", "diagnostics", "show", "secret"],
    { usage: f.usage, flush, flushTimeoutMs: 10 },
  );
  await vi.advanceTimersByTimeAsync(10);
  await running;
  expect(flush).toHaveBeenCalledOnce();
});
it("uses the registered replacement once and flushes other component stages at process boundary", async () => {
  const f = fixture();
  configureUsageTelemetry("cli", f.usage);
  f.program
    .command("connections")
    .action(() => f.usage.start("studio.setup").end());
  await runCliWithUsage(f.program, ["connections"]);
  expect(f.records).toHaveLength(2);
  expect(f.records.filter((r) => r.operation === "cli.command")).toHaveLength(
    1,
  );
  expect(
    f.records.find((r) => r.operation === "studio.setup")?.properties
      .measurement_kind,
  ).toBe("stage");
});

it("captures parse failures in prebuilt command trees instead of exiting before delivery", async () => {
  const f = fixture();
  const nested = new Command("evals");
  nested.command("run").requiredOption("--entry <path>");
  f.program.addCommand(nested);
  await expect(
    runCliWithUsage(f.program, ["evals", "run"], { usage: f.usage }),
  ).rejects.toBeInstanceOf(CommanderError);
  expect(f.records[0]).toMatchObject({
    outcome: "failed",
    properties: {
      cli_command: "evals.run",
      phase: "parse",
      error_code: "CLI_ARGUMENT_INVALID",
    },
  });
});
it("keeps connection and nested eval command families useful without dynamic names", async () => {
  const f = fixture();
  f.program
    .command("connections")
    .command("list")
    .action(() => {});
  await runCliWithUsage(f.program, ["connections", "list"], { usage: f.usage });
  expect(f.records[0]?.properties.cli_command).toBe("connections");
  const g = fixture();
  g.program.commands[0]
    ?.command("evals")
    .command("runs")
    .command("wait")
    .action(() => {});
  await runCliWithUsage(g.program, ["studio", "evals", "runs", "wait"], {
    usage: g.usage,
  });
  expect(g.records[0]?.properties).toMatchObject({
    cli_command: "studio.evals",
    cli_resource: "evals.runs",
    cli_action: "wait",
  });
});

it.each([
  false,
  true,
])("records topology strict mode %s without call expressions or paths", async (strict) => {
  const f = fixture();
  const error = new KortyxError(
    "KTX_TOPOLOGY_INCOMPLETE",
    "customer-secret-expression",
    {
      category: "validation",
      retryable: false,
      safeMessage: "Topology publication is incomplete.",
    },
  );
  f.program
    .command("topology")
    .command("push")
    .option("--entry <path>")
    .option("--fail-on-unresolved-calls")
    .action(() => {
      if (strict) throw error;
    });
  const running = runCliWithUsage(
    f.program,
    [
      "topology",
      "push",
      "--entry",
      "customer-secret-path",
      ...(strict ? ["--fail-on-unresolved-calls"] : []),
    ],
    { usage: f.usage, exitCode: () => 0 },
  );
  if (strict) await expect(running).rejects.toBe(error);
  else await running;
  expect(f.records).toHaveLength(1);
  expect(f.records[0]).toMatchObject({
    outcome: strict ? "failed" : "success",
    properties: {
      cli_command: "topology.push",
      topology_strict: strict,
      ...(strict
        ? {
            error_code: "KTX_TOPOLOGY_INCOMPLETE",
            error_category: "validation",
            retryable: false,
          }
        : {}),
    },
  });
  expect(JSON.stringify(f.records)).not.toContain("customer-secret");
});
