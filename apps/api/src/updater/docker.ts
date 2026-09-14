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
