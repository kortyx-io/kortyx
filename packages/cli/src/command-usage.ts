import type { UsageTelemetry } from "@kortyx/usage-telemetry";
import {
  flushUsageTelemetry,
  getUsageTelemetry,
} from "@kortyx/usage-telemetry/node";
import { type Command, CommanderError } from "commander";
import packageJson from "../package.json";

function commandProperties(command: Command) {
  const names: string[] = [];
  for (let current = command; current.parent; current = current.parent)
    names.unshift(current.name());
  return {
    cli_command:
      names[0] === "connections"
        ? "connections"
        : names.slice(0, 2).join(".") || "unknown",
    ...(names[0] === "studio" &&
    names[1] === "evals" &&
    (names[2] === "runs" || names[2] === "suites")
      ? { cli_resource: `evals.${names[2]}` }
      : {}),
    cli_action: names.at(-1) ?? "unknown",
  };
}

/** Compare arguments with declared commands; never record arguments or unknown names. */
function declaredCommand(program: Command, args: readonly string[]) {
  let command = program;
  for (const arg of args) {
    const child = command.commands.find(
      (candidate) =>
        candidate.name() === arg || candidate.aliases().includes(arg),
    );
    if (!child) break;
    command = child;
  }
  return command;
}

export async function runCliWithUsage(
  program: Command,
  args: string[],
  options: {
    usage?: UsageTelemetry;
    flush?: () => Promise<void>;
    exitCode?: () => string | number | undefined;
    flushTimeoutMs?: number;
  } = {},
) {
  const overrideExits = (command: Command) => {
    command.exitOverride();
    command.commands.forEach(overrideExits);
  };
  overrideExits(program);
  const usage =
    options.usage ?? getUsageTelemetry("cli", packageJson.version, "cli");
  let facts = commandProperties(declaredCommand(program, args));
  let phase = "parse";
  let flags = {};
  const scope = usage.start("cli.command", { origin: "cli" });
  program.hook("preAction", (_program, command) => {
    facts = commandProperties(command);
    phase = "execution";
    const opts = command.optsWithGlobals();
    flags = { dry_run: opts.dryRun === true, json_output: opts.json === true };
  });
  try {
    await program.parseAsync(args, { from: "user" });
    const rawCode = options.exitCode?.() ?? process.exitCode;
    const code = rawCode === undefined ? 0 : Number(rawCode);
    scope.end(code === 130 ? "cancelled" : code !== 0 ? "failed" : "success", {
      ...facts,
      ...flags,
      phase,
      ...(code !== 0 && code !== 130
        ? { error_code: "CLI_EXIT_FAILED", error_category: "unknown" }
        : {}),
    });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0)
        scope.end("success", {
          cli_command: "help",
          cli_action: "help",
          phase,
        });
      else
        scope.fail(
          {
            code: "CLI_ARGUMENT_INVALID",
            category: "validation",
            retryable: false,
          },
          { ...facts, ...flags, phase },
        );
    } else scope.fail(error, { ...facts, ...flags, phase });
    throw error;
  } finally {
    // Custom edition transports can stall too. Analytics must not keep a CLI alive.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (
          options.flush ??
          (options.usage ? () => usage.flush() : flushUsageTelemetry)
        )(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, options.flushTimeoutMs ?? 2000);
        }),
      ]);
    } catch {
      /* Preserve the command's result and original error. */
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
