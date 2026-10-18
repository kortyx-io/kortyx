import { spawn } from "node:child_process";
import { open } from "node:fs/promises";

export type Docker = (args: string[], outputFile?: string) => Promise<string>;

export const docker: Docker = async (args, outputFile) => {
  const file = outputFile ? await open(outputFile, "w", 0o600) : null;
  try {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn("docker", args, {
        stdio: ["ignore", file?.fd ?? "pipe", "pipe"],
      });
      let stdout = "";
      // Consume stderr without exposing expanded environment variables in the UI.
      child.stderr?.resume();
      child.stdout?.on("data", (chunk) => {
        if (stdout.length < 1_000_000) stdout += String(chunk);
      });
      const timer = setTimeout(() => child.kill("SIGKILL"), 30 * 60_000);
      child.once("error", () => {
        clearTimeout(timer);
        reject(new Error("Docker could not be started."));
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        if (code !== 0)
          reject(
            new Error(
              `Docker ${args[0]} failed (exit ${code}). Inspect the Docker service logs.`,
            ),
          );
        else resolve(stdout.trim());
      });
    });
  } finally {
    await file?.close();
  }
};

export const composeArgs = (home: string, args: string[]) => [
  "compose",
  "--env-file",
  `${home}/.env`,
  "-f",
  `${home}/compose.yml`,
  ...args,
];

// Inspect immutable runtime configuration, not a momentary idle-job count.
// A configured file always blocks: its contents can change after startup.
export const EVALUATION_UPDATE_GUARD = `
try {
  const targets = JSON.parse(process.env.KORTYX_EVAL_TARGETS || '[]');
  if ((process.env.KORTYX_API_DEPLOYMENT || 'self-hosted') !== 'self-hosted' ||
      process.env.KORTYX_EVAL_TARGETS_FILE || !Array.isArray(targets) || targets.length)
    process.exitCode = 1;
  else process.stdout.write('safe-no-evals');
} catch { process.exitCode = 1; }
`;

export async function assertUpdaterWithoutEvals(
  home: string,
  run: Docker,
): Promise<void> {
  let verified = false;
  try {
    verified =
      (await run(
        composeArgs(home, [
          "exec",
          "-T",
          "api",
          "node",
          "-e",
          EVALUATION_UPDATE_GUARD,
        ]),
      )) === "safe-no-evals";
  } catch {
    /* No destructive action is permitted without a verified boundary. */
  }
  if (!verified)
    throw new Error(
      "Built-in updates require an installation without configured evaluation targets. Keep services running and use controlled evaluation draining and maintenance before updating.",
    );
}

export async function runningVersion(
  home: string,
  run: Docker = docker,
): Promise<string> {
  return run(
    composeArgs(home, [
      "exec",
      "-T",
      "studio",
      "node",
      "-p",
      'require("/app/apps/studio/package.json").version',
    ]),
  );
}
