import { resolve } from "node:path";
import {
  type EvalRunner,
  type EvalRunResult,
  parseEvalSuite,
} from "@kortyx/agent";
import { Command, InvalidArgumentError } from "commander";
import { createEvalTerminalReporter } from "./reporter";

type Runtime = {
  load: (path: string) => Promise<Record<string, unknown>>;
  write?: (text: string) => void;
  release?: () => void | Promise<void>;
  color?: boolean;
  cwd?: string;
  setExitCode?: (code: number) => void;
  onInterrupt?: (abort: () => void) => () => void;
};
type Options = {
  entry: string;
  export?: string;
  suite?: string;
  case?: string[];
  repetitions?: number;
  concurrency?: number;
  json?: boolean;
  color: boolean;
};
const integer = (value: string) => {
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1
  )
    throw new InvalidArgumentError("Use a positive integer.");
  return Number(value);
};
const isRunner = (value: unknown): value is EvalRunner =>
  value !== null &&
  typeof value === "object" &&
  "run" in value &&
  typeof value.run === "function" &&
  "describe" in value &&
  typeof value.describe === "function";

export function createLocalEvalsCommand(runtime: Runtime) {
  const write =
    runtime.write ?? ((value: string) => process.stdout.write(value));
  const exitCode =
    runtime.setExitCode ??
    ((value: number) => {
      process.exitCode = value;
    });
  const color =
    runtime.color ??
    Boolean(
      process.stdout.isTTY &&
        process.env.NO_COLOR === undefined &&
        process.env.FORCE_COLOR !== "0",
    );
  const load = async (options: Options) => {
    const module = await runtime.load(
      resolve(runtime.cwd ?? process.cwd(), options.entry),
    );
    const selected = options.export
      ? module[options.export]
      : (module.evals ?? module.default);
    if (!isRunner(selected))
      throw new Error(
        `Export ${options.export ?? '"evals" or default'} must be a createEvals instance.`,
      );
    const suites = selected
      .describe()
      .suites.map((suite) => parseEvalSuite(suite));
    if (!suites.length) throw new Error("No eval suites are configured.");
    return { runner: selected, suites };
  };
  const withRunner = async (
    options: Options,
    action: (loaded: Awaited<ReturnType<typeof load>>) => Promise<void>,
  ) => {
    try {
      await action(await load(options));
    } finally {
      await runtime.release?.();
    }
  };
  const entryOptions = (command: Command) =>
    command
      .requiredOption(
        "--entry <path>",
        "Module exporting your createEvals instance (TypeScript or JavaScript).",
      )
      .option("--export <name>", "Named export; defaults to evals or default.")
      .option(
        "--json",
        "Print machine-readable JSON instead of the terminal report.",
      );
  const root = new Command("evals").description(
    "Run application evals locally, without Studio.",
  );
  entryOptions(
    root
      .command("list")
      .description("List suites exported by an application module."),
  ).action((options: Options) =>
    withRunner(options, async ({ suites }) => {
      write(
        options.json
          ? `${JSON.stringify(suites)}\n`
          : suites
              .map(
                (suite) =>
                  `${suite.id}\t${suite.name ?? suite.id}\t${suite.cases.length} cases\n`,
              )
              .join(""),
      );
    }),
  );
  entryOptions(
    root
      .command("run")
      .description(
        "Execute suites and report progress, failures and results locally.",
      ),
  )
    .option(
      "--suite <id>",
      "Run one suite; omitted runs all suites in definition order.",
    )
    .option(
      "--case <id...>",
      "Select cases within --suite (space-separated IDs).",
    )
    .option("--repetitions <count>", "Override attempts per case.", integer)
    .option(
      "--concurrency <count>",
      "Override concurrent cases within each suite.",
      integer,
    )
    .option("--no-color", "Disable terminal colors and live progress.")
    .action((options: Options) =>
      withRunner(options, async ({ runner, suites }) => {
        const selected = options.suite
          ? suites.filter((suite) => suite.id === options.suite)
          : suites;
        if (!selected.length)
          throw new Error(`Unknown eval suite: ${options.suite}`);
        if (
          options.case &&
          (!options.suite ||
            new Set(options.case).size !== options.case.length ||
            options.case.some(
              (id) => !selected[0]?.cases.some((item) => item.id === id),
            ))
        )
          throw new Error(
            "--case requires --suite and unique existing case IDs.",
          );
        const controller = new AbortController();
        const removeInterrupt = (
          runtime.onInterrupt ??
          ((abort: () => void) => {
            process.once("SIGINT", abort);
            return () => {
              process.removeListener("SIGINT", abort);
            };
          })
        )(() => controller.abort());
        const reporter = createEvalTerminalReporter(
          write,
          color && options.color && !options.json,
        );
        const runs: EvalRunResult[] = [];
        try {
          for (const suite of selected) {
            if (controller.signal.aborted) break;
            if (!options.json) reporter.start(suite);
            const result = await runner.run({
              suiteId: suite.id,
              signal: controller.signal,
              ...(options.case ? { caseIds: options.case } : {}),
              ...(options.repetitions !== undefined
                ? { repetitions: options.repetitions }
                : {}),
              ...(options.concurrency !== undefined
                ? { concurrency: options.concurrency }
                : {}),
              ...(!options.json ? { onProgress: reporter.progress } : {}),
            });
            runs.push(result);
            if (!options.json) reporter.finish(result);
          }
          const counts = { passed: 0, failed: 0, error: 0, cancelled: 0 };
          for (const run of runs)
            for (const key of Object.keys(counts) as (keyof typeof counts)[])
              counts[key] += run.counts[key];
          const cancelled = controller.signal.aborted || counts.cancelled > 0;
          const passed =
            runs.length === selected.length &&
            runs.every((run) => run.status === "passed");
          const status = cancelled
            ? "cancelled"
            : counts.error || runs.some((run) => run.status === "error")
              ? "error"
              : passed
                ? "passed"
                : "failed";
          if (options.json)
            write(
              `${JSON.stringify({ schemaVersion: 1, status, counts, runs })}\n`,
            );
          else if (selected.length > 1)
            write(
              `Overall ${status.toUpperCase()} · ${runs.length}/${selected.length} suites · ${counts.passed} passed · ${counts.failed} failed · ${counts.error} errors\n`,
            );
          exitCode(cancelled ? 130 : passed ? 0 : 1);
        } finally {
          reporter.close();
          removeInterrupt();
        }
      }),
    );
  return root;
}
