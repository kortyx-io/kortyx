import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from "commander";
import {
  printGeneratedDeploymentCredentials,
  printStudioConnection,
  resetStudio,
  restartStudio,
  rotateStudioCredentials,
  showStudioLogs,
  showStudioStatus,
  startStudio,
  stopStudio,
} from "./local-stack";
import { defaultStudioRuntime } from "./runtime";
import { defaultStudioHome, requireStudioConfig } from "./state";
import type { StudioRuntime } from "./types";

type HomeOptions = {
  home: string;
};

type StartOptions = HomeOptions & {
  apiPort?: number;
  studioPort?: number;
  imageTag?: string;
  username?: string;
  projectName?: string;
};

type LogsOptions = HomeOptions & {
  follow: boolean;
};

type ResetOptions = HomeOptions & {
  confirm: boolean;
};

type CredentialsOptions = HomeOptions & {
  generate: boolean;
  rotate: boolean;
};

const portParser = (value: string): number => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new InvalidArgumentError(
      "Port must be an integer between 1 and 65535.",
    );
  }
  return port;
};

const withHome = (command: Command): Command =>
  command.addOption(
    new Option("--home <path>", "Local Studio state directory.").default(
      defaultStudioHome(),
    ),
  );

const configureOutput = (command: Command, runtime: StudioRuntime): Command =>
  command.configureOutput({
    writeOut: (output) => runtime.log(output.trimEnd()),
    writeErr: (output) => runtime.log(output.trimEnd()),
  });

export const createStudioCommand = (
  runtime: StudioRuntime = defaultStudioRuntime,
): Command => {
  const studio = configureOutput(
    new Command("studio")
      .description("Run and manage Kortyx Studio.")
      .showHelpAfterError()
      .addHelpText(
        "after",
        "\nLocal state and generated credentials are stored in ~/.kortyx/studio by default.",
      ),
    runtime,
  );

  withHome(
    studio
      .command("start")
      .description(
        "Create or update the local stack and wait until it is healthy.",
      )
      .option("--studio-port <port>", "Studio host port.", portParser)
      .option("--api-port <port>", "Telemetry API host port.", portParser)
      .option("--image-tag <tag>", "Published Studio image tag.")
      .option("--username <name>", "Local Studio username.")
      .option("--project-name <name>", "Docker Compose project name."),
  ).action(async (options: StartOptions) => {
    await startStudio(options, runtime);
  });

  withHome(
    studio
      .command("stop")
      .description("Stop containers while preserving local data."),
  ).action(async ({ home }: HomeOptions) => {
    await stopStudio(home, runtime);
  });

  withHome(
    studio
      .command("restart")
      .description("Recreate the stack and wait until it is healthy."),
  ).action(async ({ home }: HomeOptions) => {
    await restartStudio(home, runtime);
  });

  withHome(
    studio
      .command("status")
      .description("Show container health and local endpoints."),
  ).action(async ({ home }: HomeOptions) => {
    await showStudioStatus(home, runtime);
  });

  withHome(
    studio
      .command("logs")
      .description("Show API, Studio, bootstrap, and database logs.")
      .option("--no-follow", "Print recent logs without following."),
  ).action(async ({ home, follow }: LogsOptions) => {
    await showStudioLogs(home, follow, runtime);
  });

  withHome(
    studio
      .command("credentials")
      .description("Print or rotate Studio and SDK credentials.")
      .option(
        "--rotate",
        "Replace the browser password and application API-key secrets.",
        false,
      )
      .option(
        "--generate",
        "Generate unpersisted credentials for a self-hosted deployment.",
        false,
      ),
  ).action(async ({ generate, home, rotate }: CredentialsOptions) => {
    if (generate && rotate) {
      throw new Error("Use either --generate or --rotate, not both.");
    }
    if (generate) {
      printGeneratedDeploymentCredentials(runtime);
      return;
    }
    if (rotate) {
      await rotateStudioCredentials(home, runtime);
      return;
    }
    await printStudioConnection(home, await requireStudioConfig(home), runtime);
  });

  withHome(
    studio
      .command("reset")
      .description("Delete the local Studio database volume.")
      .option("--confirm", "Confirm permanent deletion.", false),
  ).action(async ({ home, confirm }: ResetOptions) => {
    await resetStudio(home, confirm, runtime);
  });

  return studio;
};

const overrideExitTree = (command: Command): void => {
  command.exitOverride();
  for (const child of command.commands) overrideExitTree(child);
};

export const runStudioCommand = async (
  argv: string[],
  runtime: StudioRuntime = defaultStudioRuntime,
): Promise<void> => {
  const command = createStudioCommand(runtime);
  overrideExitTree(command);
  if (argv.length === 0) {
    command.outputHelp();
    return;
  }
  try {
    await command.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return;
    throw error;
  }
};

export { defaultStudioRuntime };
export type { StudioRuntime };
