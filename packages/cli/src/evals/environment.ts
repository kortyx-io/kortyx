import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseEnv } from "node:util";

const exists = async (file: string) => {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new Error(`Cannot read eval configuration: ${file}`);
  }
};

// Stop at the workspace boundary; never inherit another project's profile.
const findConfiguration = async (cwd: string) => {
  let directory = resolve(cwd);
  const directories: string[] = [];
  for (;;) {
    directories.unshift(directory);
    const profile = join(directory, ".env.evals.json");
    if (await exists(profile)) return { profile, directories };
    if (
      (await exists(join(directory, ".git"))) ||
      (await exists(join(directory, "pnpm-workspace.yaml")))
    )
      return { directories };
    if (dirname(directory) === directory)
      return { directories: [resolve(cwd)] };
    directory = dirname(directory);
  }
};

const read = async (file: string, privateFile: boolean) => {
  let stat: Awaited<ReturnType<typeof lstat>>;
  try {
    stat = await lstat(file);
  } catch {
    throw new Error(`Configured eval environment file is unavailable: ${file}`);
  }
  if (
    !stat.isFile() ||
    (privateFile &&
      process.platform !== "win32" &&
      ((stat.mode & 0o077) !== 0 ||
        (typeof process.getuid === "function" &&
          stat.uid !== process.getuid())))
  )
    throw new Error(
      `Eval configuration must be ${privateFile ? "an owner-only" : "a"} regular file: ${file}`,
    );
  try {
    return await readFile(file, "utf8");
  } catch {
    throw new Error(`Cannot read eval configuration: ${file}`);
  }
};

/** Later files override earlier files; explicit process values always win. */
export async function loadEvalEnvironment(
  cwd: string,
  envFiles?: readonly string[],
  shell: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
  let files: string[];
  let privateFiles = false;
  if (envFiles?.length) {
    files = envFiles.map((file) => resolve(cwd, file));
  } else {
    const { profile, directories } = await findConfiguration(cwd);
    if (profile) {
      let value: unknown;
      try {
        value = JSON.parse(await read(profile, true));
      } catch (error) {
        if (error instanceof SyntaxError)
          throw new Error(`Invalid eval environment profile: ${profile}`);
        throw error;
      }
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => key !== "envFiles") ||
        !("envFiles" in value) ||
        !Array.isArray(value.envFiles) ||
        !value.envFiles.length ||
        value.envFiles.some(
          (file: unknown) => typeof file !== "string" || !file.trim(),
        )
      )
        throw new Error(`Invalid eval environment profile: ${profile}`);
      files = value.envFiles.map((file: string) =>
        resolve(dirname(profile), file),
      );
      privateFiles = true;
    } else {
      files = [];
      for (const directory of directories)
        for (const name of [".env", ".env.local"]) {
          const file = resolve(directory, name);
          if (await exists(file)) files.push(file);
        }
    }
  }
  const environment: NodeJS.ProcessEnv = {};
  for (const file of files)
    Object.assign(environment, parseEnv(await read(file, privateFiles)));
  // Apply only once all files are valid; callers never receive a partial setup.
  return { ...environment, ...shell };
}
