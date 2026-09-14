import { randomUUID } from "node:crypto";
import {
  chown,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  StudioUpdateOperation,
  StudioUpdateSettings,
} from "@kortyx/telemetry-contracts";
import {
  StudioUpdateOperationSchema,
  StudioUpdateSettingsSchema,
} from "@kortyx/telemetry-contracts";

export const updatesPath = (home: string, name: string) =>
  join(home, ".updates", name);

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

// Root inside Docker must not take ownership away from the host installer.
export async function inheritOwner(path: string): Promise<void> {
  const owner = await stat(dirname(path));
  const current = await stat(path);
  if (current.uid !== owner.uid || current.gid !== owner.gid)
    await chown(path, owner.uid, owner.gid);
}

export async function privateDirectory(
  path: string,
  exclusive = false,
): Promise<void> {
  await mkdir(path, { recursive: !exclusive, mode: 0o700 });
  await inheritOwner(path);
}

export async function initializeStorage(home: string): Promise<void> {
  await privateDirectory(updatesPath(home, ""));
  for (const path of [
    join(home, ".env"),
    join(home, "config.json"),
    ...[
      "check.json",
      "settings.json",
      "operation.json",
      "automatic-day.json",
    ].map((name) => updatesPath(home, name)),
  ]) {
    try {
      await inheritOwner(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export async function atomicWrite(
  path: string,
  contents: string,
): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { mode: 0o600 });
    await inheritOwner(temporary);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function saveJson(
  home: string,
  name: string,
  data: unknown,
): Promise<void> {
  await privateDirectory(updatesPath(home, ""));
  await atomicWrite(
    updatesPath(home, name),
    `${JSON.stringify(data, null, 2)}\n`,
  );
}

export async function settings(home: string): Promise<StudioUpdateSettings> {
  return StudioUpdateSettingsSchema.parse(
    await readJson(updatesPath(home, "settings.json"), {
      automatic: false,
      hourUtc: 0,
    }),
  );
}

export async function operation(
  home: string,
): Promise<StudioUpdateOperation | null> {
  const value = await readJson(updatesPath(home, "operation.json"), null);
  return value === null ? null : StudioUpdateOperationSchema.parse(value);
}

export async function environment(
  home: string,
): Promise<Record<string, string>> {
  return Object.fromEntries(
    (await readFile(join(home, ".env"), "utf8"))
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => [
        line.slice(0, line.indexOf("=")),
        line.slice(line.indexOf("=") + 1),
      ]),
  );
}
