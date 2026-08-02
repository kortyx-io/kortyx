import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import type { CommandResult, StudioRuntime } from "./types";

const stringOutput = (value: unknown): string =>
  typeof value === "string" ? value : "";

const isCommandNotFound = (error: unknown): boolean =>
  error instanceof Error &&
  (("code" in error && error.code === "ENOENT") ||
    error.message.includes("ENOENT"));

const run = async (
  command: string,
  args: string[],
  options: { cwd?: string; inherit?: boolean },
): Promise<CommandResult> => {
  try {
    const { execa } = await import("execa");
    const result = await execa(command, args, {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      stdin: "inherit",
      stdout: options.inherit ? "inherit" : "pipe",
      stderr: options.inherit ? "inherit" : "pipe",
    });
    return {
      stdout: stringOutput(result.stdout),
      stderr: stringOutput(result.stderr),
    };
  } catch (error) {
    if (isCommandNotFound(error)) {
      throw new Error(
        `Could not run ${command}. Install and start Docker Desktop, then try again.`,
        { cause: error },
      );
    }
    throw error;
  }
};

const portAvailable = async (port: number): Promise<boolean> =>
  await new Promise<boolean>((resolvePromise) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolvePromise(false));
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => resolvePromise(true));
    });
  });

export const defaultStudioRuntime: StudioRuntime = {
  run,
  portAvailable,
  now: () => new Date().toISOString(),
  random: (bytes) => randomBytes(bytes).toString("base64url"),
  log: (message = "") => console.log(message),
};
