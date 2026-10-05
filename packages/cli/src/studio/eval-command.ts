import type {
  StudioEvalDetail,
  StudioEvalRunSummary,
} from "@kortyx/agent/evals";
import { type Command, InvalidArgumentError } from "commander";
import {
  type ConnectionOptions,
  defaultConnectionsHome,
  resolveConnection,
} from "../connections";
import { parseEvalRunTarget, StudioEvalClient } from "./eval-client";
import {
  buildEvalDoctorReport,
  type EvalDoctorReport,
  evalDoctorFailure,
  formatEvalDoctorReport,
} from "./eval-doctor";
import { StudioReadError } from "./read-client";
import { formatReadOutput, sanitizeStudioData } from "./read-output";
import { defaultStudioHome } from "./state";

type EvalOptions = ConnectionOptions & {
  json?: boolean;
  includeContent?: boolean;
  target?: string;
  judge?: "studio" | "app";
  environment?: string;
  case?: string[];
  repetitions: number;
  concurrency: number;
};
const integer = (max: number) => (value: string) => {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max)
    throw new InvalidArgumentError(`Expected an integer between 1 and ${max}.`);
  return Number(value);
};
const summary = ({ error: _error, ...run }: StudioEvalRunSummary) => run;
const compactDetail = (run: StudioEvalDetail) => ({
  ...summary(run),
  suite: undefined,
  events: undefined,
  result: undefined,
  caseResults: run.result?.cases.map(
    ({ caseId, repetition, status, durationMs, steps }) => ({
      caseId,
      repetition,
      status,
      durationMs,
      steps: steps.map(({ index, status, criteria }) => ({
        index,
        status,
        criteria: criteria.map(({ id, passed }) => ({ id, passed })),
      })),
    }),
  ),
});

export function registerStudioEvalCommands(
  studio: Command,
  log: (message: string) => void,
  request: typeof fetch = fetch,
) {
  const common = (command: Command) =>
    command
      .option(
        "--connection <name>",
        "Named project/API connection (or KORTYX_CONNECTION).",
      )
      .option(
        "--config-home <path>",
        "Connection configuration directory.",
        defaultConnectionsHome(),
      )
      .option(
        "--home <path>",
        "Managed local Studio directory.",
        defaultStudioHome(),
      )
      .option("--api-url <url>", "Direct API URL; requires --api-key-env.")
      .option(
        "--api-key-env <name>",
        "Environment variable holding a Studio key.",
      )
      .option("--json", "Print stable machine-readable JSON.")
      .option(
        "--include-content",
        "Include suite definitions and captured execution content.",
      );
  const print = (value: unknown, options: EvalOptions) =>
    log(
      formatReadOutput(
        sanitizeStudioData(
          { schemaVersion: 1, ...(value as Record<string, unknown>) },
          options.includeContent ?? false,
        ),
        options.json ?? false,
      ),
    );
  const clientFor = async (options: EvalOptions, url?: string) => {
    const connection = await resolveConnection(options, url);
    return {
      connection,
      client: new StudioEvalClient(
        connection.apiUrl,
        connection.apiKey,
        request,
      ),
    };
  };
  const evals = studio
    .command("evals")
    .description(
      "Discover suites, enqueue evals, inspect saved results and cancel runs.",
    );
  const suites = evals
    .command("suites")
    .description("Discover application-owned eval suites.");
  const discover = async (options: EvalOptions) => {
    const { connection, client } = await clientFor(options);
    const data = await client.targets();
    const environment = options.environment ?? connection.environment;
    const targets = data.targets.filter(
      (target) =>
        (!options.target || target.id === options.target) &&
        (!environment || target.environment === environment),
    );
    return {
      connection,
      client,
      targets,
      canRun: data.canRun,
      studioJudge: data.studioJudge ?? null,
    };
  };
  const selectionOptions = (command: Command) =>
    common(command)
      .option("--target <id>", "Application eval target ID.")
      .option(
        "--environment <name>",
        "Filter targets; defaults to the connection environment.",
      );
  selectionOptions(
    evals
      .command("doctor")
      .description(
        "Check deployment wiring without starting workflows or model calls.",
      ),
  )
    .option("--suite <id>", "Check that a specific suite is registered.")
    .option(
      "--judge <location>",
      "Judge to check: studio (default) or app.",
      (value: string) => {
        if (value !== "studio" && value !== "app")
          throw new InvalidArgumentError("Expected studio or app.");
        return value;
      },
      "studio",
    )
    .action(async (options: EvalOptions & { suite?: string }) => {
      let report: EvalDoctorReport;
      try {
        const { connection, client } = await clientFor(options);
        report = buildEvalDoctorReport(await client.targets(), {
          ...options,
          environment: options.environment ?? connection.environment,
          judge: options.judge ?? "studio",
        });
      } catch (error) {
        report = evalDoctorFailure(error);
      }
      log(
        options.json ? JSON.stringify(report) : formatEvalDoctorReport(report),
      );
      if (report.status === "failed") process.exitCode = 1;
    });
  selectionOptions(
    suites
      .command("list")
      .description("List targets, suites, revisions and case IDs."),
  ).action(async (options: EvalOptions) => {
    const { connection, targets, canRun, studioJudge } =
      await discover(options);
    print(
      {
        connection: connection.name,
        canRun,
        studioJudge,
        targets: targets.map((target) => ({
          id: target.id,
          name: target.name,
          environment: target.environment,
          available: target.manifest !== null,
          appJudge: target.manifest?.judge ?? null,
          studioJudging: Boolean(target.manifest?.studioJudging),
          suites:
            target.manifest?.suites.map((suite) => ({
              id: suite.id,
              name: suite.name,
              revision: target.revisions[suite.id],
              caseIds: suite.cases.map((item) => item.id),
            })) ?? [],
        })),
      },
      options,
    );
  });
  const select = async (suiteId: string, options: EvalOptions) => {
    const data = await discover(options);
    const matches = data.targets.flatMap((target) => {
      const suite = target.manifest?.suites.find((item) => item.id === suiteId);
      return suite ? [{ target, suite }] : [];
    });
    const match = matches[0];
    if (matches.length !== 1 || !match)
      throw new StudioReadError(
        "invalid_suite_selection",
        matches.length
          ? "Suite exists on multiple targets. Select --target and/or --environment."
          : "Suite unavailable. List suites and check the target connection.",
      );
    return { ...data, ...match };
  };
  selectionOptions(
    suites
      .command("get <suite-id>")
      .description(
        "Read a suite; --include-content returns its full definition.",
      ),
  ).action(async (suiteId: string, options: EvalOptions) => {
    const { connection, target, suite } = await select(suiteId, options);
    print(
      {
        connection: connection.name,
        targetId: target.id,
        revision: target.revisions[suite.id],
        suite: options.includeContent
          ? suite
          : {
              id: suite.id,
              name: suite.name,
              caseIds: suite.cases.map((item) => item.id),
            },
      },
      options,
    );
  });
  const runs = evals
    .command("runs")
    .description("Start and inspect saved eval runs.");
  selectionOptions(
    runs
      .command("start <suite-id>")
      .description(
        "Enqueue once and return immediately; does not wait for grades.",
      ),
  )
    .option(
      "--case <id>",
      "Select a case; repeat for multiple cases.",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      "--repetitions <count>",
      "Attempts per selected case (1–20).",
      integer(20),
      1,
    )
    .option("--concurrency <count>", "Parallel attempts (1–4).", integer(4), 1)
    .option(
      "--judge <location>",
      "Judge selection: studio (default) or app.",
      (value: string) => {
        if (value !== "studio" && value !== "app")
          throw new InvalidArgumentError("Expected studio or app.");
        return value;
      },
      "studio",
    )
    .action(async (suiteId: string, options: EvalOptions) => {
      const { connection, client, target, suite, canRun } = await select(
        suiteId,
        options,
      );
      if (!canRun)
        throw new StudioReadError(
          "eval_forbidden",
          "This Studio key requires eval:run to execute suites.",
        );
      const caseIds = options.case ?? [];
      if (
        new Set(caseIds).size !== caseIds.length ||
        caseIds.some((id) => !suite.cases.some((item) => item.id === id)) ||
        (caseIds.length || suite.cases.length) * options.repetitions > 100
      )
        throw new StudioReadError(
          "invalid_case_selection",
          "Select unique existing case IDs and at most 100 total attempts.",
        );
      const run = await client.start({
        targetId: target.id,
        judge: options.judge ?? "studio",
        suiteId,
        suiteRevision: target.revisions[suiteId] ?? "",
        repetitions: options.repetitions,
        concurrency: options.concurrency,
        ...(caseIds.length ? { caseIds } : {}),
      });
      print(
        {
          connection: connection.name,
          id: run.id,
          status: "queued",
          studioUrl: connection.studioUrl
            ? `${connection.studioUrl}/evals/runs/${run.id}`
            : null,
        },
        options,
      );
    });
  common(
    runs
      .command("list")
      .description("List the latest 100 saved runs in this project."),
  )
    .option(
      "--environment <name>",
      "Filter results; defaults to the connection environment.",
    )
    .action(async (options: EvalOptions) => {
      const { connection, client } = await clientFor(options);
      const data = await client.runs();
      const environment = options.environment ?? connection.environment;
      print(
        {
          connection: connection.name,
          runs: data.runs
            .filter((run) => !environment || run.environment === environment)
            .map(summary),
        },
        options,
      );
    });
  common(
    runs
      .command("get <id-or-url>")
      .description(
        "Read status, counts and criterion verdicts; content is opt-in.",
      ),
  ).action(async (input: string, options: EvalOptions) => {
    const target = parseEvalRunTarget(input);
    const { connection, client } = await clientFor(options, target.url);
    const { run } = await client.run(target.id);
    print(
      {
        connection: connection.name,
        run: options.includeContent ? run : compactDetail(run),
      },
      options,
    );
  });
  common(
    runs
      .command("cancel <id-or-url>")
      .description(
        "Request cooperative cancellation of a queued or running eval.",
      ),
  ).action(async (input: string, options: EvalOptions) => {
    const target = parseEvalRunTarget(input);
    const { connection, client } = await clientFor(options, target.url);
    const data = await client.cancel(target.id);
    print({ connection: connection.name, id: target.id, ...data }, options);
  });
}
