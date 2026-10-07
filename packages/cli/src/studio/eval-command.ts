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
  all?: boolean;
  suite?: string[];
  wait?: boolean;
  timeout: number;
  name?: string;
  source?: "manual" | "deployment" | "schedule" | "ci";
  commit?: string;
  deploymentUrl?: string;
  idempotencyKey?: string;
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
  const terminal = (status: string) =>
    status !== "queued" && status !== "running";
  const resultExitCode = (status: string) =>
    status === "passed"
      ? 0
      : status === "failed"
        ? 1
        : status === "cancelled"
          ? 130
          : 2;
  const waitForEvaluation = async (
    client: StudioEvalClient,
    id: string,
    timeout: number,
  ) => {
    const deadline = Date.now() + timeout * 1000;
    for (;;) {
      const { run } = await client.evaluation(id);
      if (terminal(run.status)) return run;
      if (Date.now() >= deadline)
        throw new StudioReadError(
          "eval_wait_timeout",
          `Evaluation ${id} is still running. Inspect it with evals runs get; waiting did not cancel it.`,
        );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(2000, deadline - Date.now())),
      );
    }
  };
  const readEvaluation = async (
    client: StudioEvalClient,
    id: string,
    includeContent: boolean,
  ) => {
    // Summary reads include criterion pass/fail without prompts or observations.
    const { run } = await client.evaluationResults(id);
    return includeContent
      ? run
      : { ...run, suites: run.suites.map(compactDetail) };
  };
  const waitOptions = (command: Command) =>
    command.option(
      "--timeout <seconds>",
      "Maximum time to wait (1–7200 seconds); does not cancel execution.",
      integer(7200),
      1800,
    );
  const runs = evals
    .command("runs")
    .description("Start and inspect saved eval runs.");
  selectionOptions(
    runs
      .command("start [suite-id]")
      .description(
        "Start an evaluation containing all or selected suites; optionally wait for results.",
      ),
  )
    .option("--all", "Run every suite registered on the selected application.")
    .option(
      "--suite <id>",
      "Select a suite; repeat for several suites.",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option("--name <name>", "Display name for this evaluation run.")
    .option(
      "--source <source>",
      "Trigger: manual, deployment, schedule or ci.",
      (value: string) => {
        if (!["manual", "deployment", "schedule", "ci"].includes(value))
          throw new InvalidArgumentError(
            "Expected manual, deployment, schedule or ci.",
          );
        return value;
      },
      "manual",
    )
    .option("--commit <sha>", "Deployed application commit.")
    .option("--deployment-url <url>", "Deployment or CI job URL.")
    .option(
      "--idempotency-key <key>",
      "Reuse a matching saved evaluation after a trigger retry.",
    )
    .option(
      "--wait",
      "Wait for final results and return a pass/fail exit code.",
    )
    .option(
      "--timeout <seconds>",
      "Maximum wait in seconds (1–7200); execution continues after timeout.",
      integer(7200),
      1800,
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
    .action(async (suiteId: string | undefined, options: EvalOptions) => {
      const ids = [...(suiteId ? [suiteId] : []), ...(options.suite ?? [])];
      if (
        (!options.all && !ids.length) ||
        (options.all && ids.length) ||
        new Set(ids).size !== ids.length
      )
        throw new StudioReadError(
          "invalid_suite_selection",
          "Choose --all or unique suite IDs (positional or repeated --suite).",
        );
      const data = await discover(options);
      const matches = data.targets.filter(
        (target) =>
          target.manifest &&
          (options.all ||
            ids.every((id) =>
              target.manifest!.suites.some((suite) => suite.id === id),
            )),
      );
      const target = matches[0];
      if (matches.length !== 1 || !target?.manifest)
        throw new StudioReadError(
          "invalid_suite_selection",
          "Select one available application with --target and --environment; all selected suites must belong to it.",
        );
      if (!data.canRun)
        throw new StudioReadError(
          "eval_forbidden",
          "This Studio key requires eval:run to execute suites.",
        );
      const suites = options.all
        ? target.manifest.suites
        : ids.map(
            (id) => target.manifest!.suites.find((suite) => suite.id === id)!,
          );
      const caseIds = options.case ?? [];
      if (caseIds.length && (options.all || suites.length !== 1))
        throw new StudioReadError(
          "invalid_case_selection",
          "--case requires exactly one selected suite.",
        );
      if (
        new Set(caseIds).size !== caseIds.length ||
        caseIds.some(
          (id) => !suites[0]?.cases.some((item) => item.id === id),
        ) ||
        suites.some(
          (suite) =>
            (caseIds.length || suite.cases.length) * options.repetitions > 100,
        )
      )
        throw new StudioReadError(
          "invalid_case_selection",
          "Select unique existing cases and at most 100 attempts per suite.",
        );
      const run = await data.client.startEvaluation({
        targetId: target.id,
        selection: options.all ? "all" : "selected",
        suites: suites.map((suite) => ({
          suiteId: suite.id,
          suiteRevision: target.revisions[suite.id] ?? "",
          ...(caseIds.length ? { caseIds } : {}),
        })),
        judge: options.judge ?? "studio",
        repetitions: options.repetitions,
        concurrency: options.concurrency,
        name: options.name,
        metadata: {
          source: options.source ?? "manual",
          commit: options.commit,
          deploymentUrl: options.deploymentUrl,
        },
        idempotencyKey: options.idempotencyKey,
      });
      const studioUrl = data.connection.studioUrl
        ? `${data.connection.studioUrl}/evals/evaluations/${run.id}`
        : null;
      if (!options.wait) {
        print(
          {
            connection: data.connection.name,
            id: run.id,
            status: "queued",
            studioUrl,
          },
          options,
        );
        return;
      }
      try {
        const completed = await waitForEvaluation(
          data.client,
          run.id,
          options.timeout,
        );
        print(
          {
            connection: data.connection.name,
            studioUrl,
            run: await readEvaluation(
              data.client,
              run.id,
              options.includeContent ?? false,
            ),
          },
          options,
        );
        process.exitCode = resultExitCode(completed.status);
      } catch (error) {
        process.exitCode = 2;
        throw error;
      }
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
      const data = await client.evaluations();
      const environment = options.environment ?? connection.environment;
      print(
        {
          connection: connection.name,
          runs: data.runs
            .filter((run) => !environment || run.environment === environment)
            .map((run) => run),
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
    let run: unknown;
    try {
      run = await readEvaluation(
        client,
        target.id,
        options.includeContent ?? false,
      );
    } catch (error) {
      if (!(error instanceof StudioReadError) || error.status !== 404)
        throw error;
      const legacy = await client.run(target.id);
      run = options.includeContent ? legacy.run : compactDetail(legacy.run);
    }
    print(
      {
        connection: connection.name,
        run,
      },
      options,
    );
  });
  waitOptions(
    common(
      runs
        .command("wait <id-or-url>")
        .description(
          "Wait for a grouped evaluation and print its final suite/case results.",
        ),
    ),
  ).action(async (input: string, options: EvalOptions) => {
    const target = parseEvalRunTarget(input);
    const { connection, client } = await clientFor(options, target.url);
    try {
      const completed = await waitForEvaluation(
        client,
        target.id,
        options.timeout,
      );
      print(
        {
          connection: connection.name,
          run: await readEvaluation(
            client,
            target.id,
            options.includeContent ?? false,
          ),
        },
        options,
      );
      process.exitCode = resultExitCode(completed.status);
    } catch (error) {
      process.exitCode = 2;
      throw error;
    }
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
    let data: { ok: boolean };
    try {
      data = await client.cancelEvaluation(target.id);
    } catch (error) {
      if (!(error instanceof StudioReadError) || error.status !== 404)
        throw error;
      data = await client.cancel(target.id);
    }
    print({ connection: connection.name, id: target.id, ...data }, options);
  });
}
