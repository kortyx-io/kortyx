import {
  ensureStudioState,
  readStudioEnvironment,
  requireStudioConfig,
  type StudioConfig,
  studioComposePath,
  studioEnvPath,
} from "./state";
import type { CommandResult, StudioRuntime, StudioStartOptions } from "./types";

const composeArgs = (home: string, args: string[]): string[] => [
  "compose",
  "--env-file",
  studioEnvPath(home),
  "-f",
  studioComposePath(home),
  ...args,
];

const runCompose = async (
  home: string,
  args: string[],
  runtime: StudioRuntime,
  inherit = true,
): Promise<CommandResult> =>
  await runtime.run("docker", composeArgs(home, args), {
    cwd: home,
    inherit,
  });

const preflightDocker = async (runtime: StudioRuntime): Promise<void> => {
  await runtime.run("docker", ["version", "--format", "{{.Server.Version}}"], {
    inherit: false,
  });
  await runtime.run("docker", ["compose", "version", "--short"], {
    inherit: false,
  });
};

const hasRunningServices = async (
  home: string,
  runtime: StudioRuntime,
): Promise<boolean> => {
  const result = await runCompose(
    home,
    ["ps", "--status", "running", "--services"],
    runtime,
    false,
  );
  return result.stdout.trim().length > 0;
};

const assertPortsAvailable = async (
  config: StudioConfig,
  runtime: StudioRuntime,
): Promise<void> => {
  for (const [label, port] of [
    ["Studio", config.studioPort],
    ["API", config.apiPort],
  ] as const) {
    if (!(await runtime.portAvailable(port))) {
      throw new Error(
        `${label} port ${port} is already in use. Choose another with --${label.toLowerCase()}-port ${port + 1}.`,
      );
    }
  }
};

export const printStudioConnection = async (
  home: string,
  config: StudioConfig,
  runtime: StudioRuntime,
): Promise<void> => {
  const environment = await readStudioEnvironment(home);
  runtime.log();
  runtime.log("Kortyx Studio connection");
  runtime.log(`  Studio:  http://localhost:${config.studioPort}`);
  runtime.log(`  API:     http://localhost:${config.apiPort}`);
  runtime.log(`  Username: ${environment.KORTYX_STUDIO_BASIC_AUTH_USERNAME}`);
  runtime.log(`  Password: ${environment.KORTYX_STUDIO_BASIC_AUTH_PASSWORD}`);
  runtime.log();
  runtime.log("Add these server-side variables to your Kortyx SDK project:");
  runtime.log(`  KORTYX_TELEMETRY_API_URL=http://localhost:${config.apiPort}`);
  runtime.log(
    `  KORTYX_TELEMETRY_API_KEY=${environment.KORTYX_TELEMETRY_API_KEY}`,
  );
  runtime.log("  KORTYX_TELEMETRY_ENVIRONMENT=development");
  runtime.log("  KORTYX_TELEMETRY_SERVICE_NAME=my-agent");
  runtime.log();
  runtime.log(`Local state: ${home}`);
};

export const startStudio = async (
  options: StudioStartOptions,
  runtime: StudioRuntime,
): Promise<void> => {
  await preflightDocker(runtime);
  const config = await ensureStudioState(options, runtime);
  if (!(await hasRunningServices(options.home, runtime))) {
    await assertPortsAvailable(config, runtime);
  }
  runtime.log(
    "Starting Kortyx Studio. The first image pull can take a few minutes.",
  );
  await runCompose(
    options.home,
    ["up", "-d", "--wait", "--wait-timeout", "180"],
    runtime,
  );
  runtime.log("Kortyx Studio is ready.");
  await printStudioConnection(options.home, config, runtime);
};

export const stopStudio = async (
  home: string,
  runtime: StudioRuntime,
): Promise<void> => {
  await preflightDocker(runtime);
  await requireStudioConfig(home);
  await runCompose(home, ["stop"], runtime);
  runtime.log(
    "Kortyx Studio stopped. Local data and credentials were preserved.",
  );
};

export const restartStudio = async (
  home: string,
  runtime: StudioRuntime,
): Promise<void> => {
  await preflightDocker(runtime);
  const config = await requireStudioConfig(home);
  await runCompose(
    home,
    ["up", "-d", "--force-recreate", "--wait", "--wait-timeout", "180"],
    runtime,
  );
  runtime.log("Kortyx Studio restarted.");
  await printStudioConnection(home, config, runtime);
};

export const showStudioStatus = async (
  home: string,
  runtime: StudioRuntime,
): Promise<void> => {
  await preflightDocker(runtime);
  const config = await requireStudioConfig(home);
  await runCompose(home, ["ps"], runtime);
  runtime.log();
  runtime.log(`Studio: http://localhost:${config.studioPort}`);
  runtime.log(`API:    http://localhost:${config.apiPort}`);
  runtime.log(`State:  ${home}`);
};

export const showStudioLogs = async (
  home: string,
  follow: boolean,
  runtime: StudioRuntime,
): Promise<void> => {
  await preflightDocker(runtime);
  await requireStudioConfig(home);
  await runCompose(
    home,
    ["logs", ...(follow ? ["--follow"] : []), "--tail", "200"],
    runtime,
  );
};

export const resetStudio = async (
  home: string,
  confirm: boolean,
  runtime: StudioRuntime,
): Promise<void> => {
  if (!confirm) {
    throw new Error(
      'Reset permanently deletes the local Studio database. Re-run with "kortyx studio reset --confirm".',
    );
  }
  await preflightDocker(runtime);
  await requireStudioConfig(home);
  await runCompose(home, ["down", "--volumes", "--remove-orphans"], runtime);
  runtime.log(
    'Kortyx Studio data was deleted. Credentials were preserved; run "kortyx studio start" to create a fresh database.',
  );
};
