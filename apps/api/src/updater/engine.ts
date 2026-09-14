import { copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { StudioUpdateOperation } from "@kortyx/telemetry-contracts";
import {
  newerStudioVersion,
  StudioReleaseSchema,
} from "@kortyx/telemetry-contracts";
import type { Docker } from "./docker";
import { composeArgs, docker, runningVersion } from "./docker";
import {
  atomicWrite,
  environment,
  operation,
  saveJson,
  settings,
  updatesPath,
} from "./storage";

export async function failUpdate(home: string, message: string): Promise<void> {
  const current = await operation(home);
  if (current)
    await saveJson(home, "operation.json", {
      ...current,
      phase: "failed",
      updatedAt: new Date().toISOString(),
      messages: [
        ...current.messages.slice(-98),
        message,
        "Automatic updates are paused. Recover manually before enabling them again.",
      ],
    });
  await saveJson(home, "settings.json", {
    ...(await settings(home)),
    automatic: false,
  });
}

export async function applyUpdate(
  home: string,
  id: string,
  run: Docker = docker,
): Promise<void> {
  const pending = await operation(home);
  if (!pending || pending.id !== id || pending.phase !== "starting")
    throw new Error("Update operation is not pending.");
  let current: StudioUpdateOperation = pending;
  const release = StudioReleaseSchema.parse(current.release);
  const progress = async (
    phase: StudioUpdateOperation["phase"],
    message: string,
  ) => {
    current = {
      ...current,
      phase,
      updatedAt: new Date().toISOString(),
      messages: [...current.messages.slice(-99), message],
    };
    await saveJson(home, "operation.json", current);
  };
  let stopped = false;
  let installationStarted = false;
  try {
    const actual = await runningVersion(home, run);
    if (!newerStudioVersion(release.version, actual))
      throw new Error("Only newer Studio releases can be installed.");
    await progress(
      "pulling",
      `Downloading Studio and API v${release.version}.`,
    );
    await run(["pull", release.api]);
    await run(["pull", release.studio]);

    const backup = updatesPath(home, `backups/${id}`);
    await mkdir(backup, { recursive: true, mode: 0o700 });
    for (const name of [".env", "config.json", "compose.yml"])
      await copyFile(join(home, name), join(backup, name));
    current = { ...current, backup };
    await progress(
      "backup",
      "Pausing ingestion and Studio while backing up the database and configuration.",
    );
    await run(composeArgs(home, ["stop", "api", "studio"]));
    stopped = true;
    await run(
      composeArgs(home, [
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        "kortyx",
        "-d",
        "kortyx",
        "-Fc",
      ]),
      join(backup, "database.dump"),
    );
    if ((await stat(join(backup, "database.dump"))).size === 0)
      throw new Error("Database backup is empty; installation was cancelled.");
    // Verify the archive can be read before any migration or image replacement.
    await run([
      "run",
      "--rm",
      "--network",
      "none",
      "--mount",
      `type=bind,source=${backup},target=/backup,readonly`,
      "postgres:17-alpine",
      "pg_restore",
      "--list",
      "/backup/database.dump",
    ]);

    const env = await environment(home);
    env.KORTYX_STUDIO_IMAGE_TAG = `v${release.version}`;
    env.KORTYX_API_IMAGE_REF = release.api;
    env.KORTYX_STUDIO_IMAGE_REF = release.studio;
    installationStarted = true;
    await atomicWrite(
      join(home, ".env"),
      `${Object.entries(env)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n")}\n`,
    );
    const config = JSON.parse(
      await readFile(join(home, "config.json"), "utf8"),
    );
    await atomicWrite(
      join(home, "config.json"),
      `${JSON.stringify({ ...config, imageTag: `v${release.version}` }, null, 2)}\n`,
    );
    await progress(
      "installing",
      "Applying migrations and starting the published release.",
    );
    // This worker is a detached container, not one of the services being replaced.
    await run(
      composeArgs(home, ["up", "-d", "--wait", "--wait-timeout", "180"]),
    );
    await progress(
      "verifying",
      "Checking container health, the installed version, and telemetry access.",
    );
    if ((await runningVersion(home, run)) !== release.version)
      throw new Error(
        "The running Studio version does not match the requested release.",
      );
    await run(
      composeArgs(home, [
        "exec",
        "-T",
        "studio",
        "node",
        "-e",
        `
      fetch(process.env.KORTYX_API_URL + '/v1/studio/runs', {
        headers: { authorization: 'Bearer ' + process.env.KORTYX_STUDIO_API_KEY }
      }).then(async response => {
        if (!response.ok || !Array.isArray((await response.json()).runs)) process.exit(1);
      }).catch(() => process.exit(1));
    `,
      ]),
    );
    await progress(
      "succeeded",
      `Studio v${release.version} is healthy. Your backup has been retained.`,
    );
  } catch (error) {
    if (stopped && !installationStarted) {
      await run(
        composeArgs(home, ["up", "-d", "--wait", "api", "studio"]),
      ).catch(() => undefined);
    }
    await failUpdate(
      home,
      error instanceof Error
        ? error.message
        : "Update failed. Inspect the local service logs.",
    );
  } finally {
    await rm(updatesPath(home, "lock"), { recursive: true, force: true });
  }
}
