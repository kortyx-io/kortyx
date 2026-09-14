import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

export async function atomicWrite(
  path: string,
  contents: string,
): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600 });
  await rename(temporary, path);
}

export async function saveJson(
  home: string,
  name: string,
  data: unknown,
): Promise<void> {
  await mkdir(updatesPath(home, ""), { recursive: true, mode: 0o700 });
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
