import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StudioRelease } from "@kortyx/telemetry-contracts";
import {
  newerStudioVersion,
  StudioReleaseSchema,
} from "@kortyx/telemetry-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Docker } from "../src/updater/docker";
import { applyUpdate } from "../src/updater/engine";
import {
  latestStudioRelease,
  ReleaseCheckError,
} from "../src/updater/releases";
import { StudioUpdater, updaterAuthorized } from "../src/updater/service";
import {
  environment,
  operation,
  saveJson,
  settings,
  updatesPath,
} from "../src/updater/storage";

const release: StudioRelease = {
  format: 1,
  installer: 1,
  version: "0.3.0",
  api: `ghcr.io/kortyx-io/kortyx-api@sha256:${"a".repeat(64)}`,
  studio: `ghcr.io/kortyx-io/kortyx-studio@sha256:${"b".repeat(64)}`,
  deployment: { strategy: "recreate" },
};
const homes: string[] = [];
afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

async function home() {
  const path = await mkdtemp(join(tmpdir(), "kortyx-updater-test-"));
  homes.push(path);
  await writeFile(
    join(path, ".env"),
    "KORTYX_COMPOSE_PROJECT_NAME=kortyx-update-test\nKORTYX_STUDIO_IMAGE_TAG=v0.2.0\nKORTYX_STUDIO_UPDATE_TOKEN=unchanged-secret\n",
  );
  await writeFile(
    join(path, "config.json"),
    JSON.stringify({ imageTag: "v0.2.0", apiPort: 6400 }),
  );
  await writeFile(join(path, "compose.yml"), "services: {}\n");
  return path;
}

async function pending(path: string) {
  const id = randomUUID();
  await saveJson(path, "settings.json", { automatic: true, hourUtc: 0 });
  await saveJson(path, "operation.json", {
    id,
    from: "0.2.0",
    release,
    phase: "starting",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    backup: null,
    messages: [],
  });
  await mkdir(updatesPath(path, "lock"));
  return id;
}

function runtime(failure?: "pull" | "backup" | "install" | "verify") {
  let installed = false;
  const run = vi.fn<Docker>(async (args, output) => {
    if (args.includes("pg_dump")) {
      if (failure === "backup") throw new Error("Backup failed");
      if (output) await writeFile(output, "archive");
    }
    if (args[0] === "pull" && failure === "pull")
      throw new Error("Pull failed");
    if (args.includes("up")) {
      if (failure === "install") throw new Error("Migration failed");
      if (!args.includes("--wait-timeout")) return "";
      installed = true;
    }
    if (args.includes("-p"))
      return installed ? (failure === "verify" ? "0.2.0" : "0.3.0") : "0.2.0";
    return "";
  });
  return run;
}

describe("published releases", () => {
  it("compares numeric versions and rejects prereleases and arbitrary image sources", () => {
    expect(newerStudioVersion("0.10.0", "0.9.0")).toBe(true);
    expect(newerStudioVersion("0.2.0", "0.2.0")).toBe(false);
    expect(newerStudioVersion("0.1.9", "0.2.0")).toBe(false);
    expect(() => newerStudioVersion("0.3.0-beta.1", "0.2.0")).toThrow();
    expect(() =>
      StudioReleaseSchema.parse({ ...release, api: "example.com/evil:latest" }),
    ).toThrow();
    expect(() =>
      StudioReleaseSchema.parse({ ...release, installer: 2 }),
    ).toThrow();
  });

  it("reads the completed manifest directly from the CDN without GitHub requests", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(release));
    expect(await latestStudioRelease(fetcher)).toEqual(release);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://updates.kortyx.io/studio/stable.json",
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("fails closed on unavailable, malformed, oversized, or unsupported manifests", async () => {
    for (const response of [
      new Response("", { status: 429 }),
      new Response("<html>Unavailable</html>"),
      new Response("x".repeat(16_385)),
      Response.json({ ...release, installer: 2 }),
      Response.json({ ...release, version: "0.4.0-beta.1" }),
      Response.json({ ...release, api: "example.com/untrusted:latest" }),
    ]) {
      await expect(
        latestStudioRelease(vi.fn().mockResolvedValue(response)),
      ).rejects.toThrow();
    }
  });

  it("passes CDN retry instructions to the scheduler", async () => {
    await expect(
      latestStudioRelease(
        vi.fn().mockResolvedValue(
          new Response("", {
            status: 503,
            headers: { "Retry-After": "7200" },
          }),
        ),
      ),
    ).rejects.toMatchObject({ retryAfterMs: 7_200_000 });
  });
});

describe("update execution", () => {
  it("backs up before migrations, preserves credentials, and pins both published digests", async () => {
    const path = await home();
    const id = await pending(path);
    const run = runtime();
    await applyUpdate(path, id, run);
    const result = await operation(path);
    expect(result?.phase).toBe("succeeded");
    const updated = await environment(path);
    expect(updated.KORTYX_API_IMAGE_REF).toBe(release.api);
    expect(updated.KORTYX_STUDIO_IMAGE_REF).toBe(release.studio);
    expect(updated.KORTYX_STUDIO_UPDATE_TOKEN).toBe("unchanged-secret");
    expect(
      await readFile(join(result?.backup ?? "", ".env"), "utf8"),
    ).toContain("v0.2.0");
    const calls = run.mock.calls.map(([args]) => args);
    expect(calls.findIndex((args) => args.includes("pg_dump"))).toBeLessThan(
      calls.findIndex((args) => args.includes("up")),
    );
    expect(
      calls.some(
        (args) => args.includes("pg_restore") && args.includes("--list"),
      ),
    ).toBe(true);
    await expect(readFile(updatesPath(path, "lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each([
    "pull",
    "backup",
    "install",
    "verify",
  ] as const)("records %s failures and pauses automatic updates without downgrading", async (failure) => {
    const path = await home();
    const id = await pending(path);
    const run = runtime(failure);
    await applyUpdate(path, id, run);
    expect((await operation(path))?.phase).toBe("failed");
    expect((await settings(path)).automatic).toBe(false);
    const updated = await environment(path);
    expect(updated.KORTYX_STUDIO_IMAGE_TAG).toBe(
      failure === "pull" || failure === "backup" ? "v0.2.0" : "v0.3.0",
    );
    expect(run.mock.calls.every(([args]) => !args.includes("--clean"))).toBe(
      true,
    );
    if (failure === "pull")
      expect(run.mock.calls.some(([args]) => args.includes("stop"))).toBe(
        false,
      );
    if (failure === "backup")
      expect(
        run.mock.calls.some(
          ([args]) => args.includes("up") && !args.includes("--wait-timeout"),
        ),
      ).toBe(true);
  });

  it("refuses concurrent operations and downgrades", async () => {
    const path = await home();
    await pending(path);
    const updater = new StudioUpdater(path, runtime(), async () => release);
    await expect(updater.start("0.3.0")).rejects.toThrow("already running");
    await rm(updatesPath(path, "lock"), { recursive: true });
    const older = new StudioUpdater(path, runtime(), async () => ({
      ...release,
      version: "0.1.0",
    }));
    await expect(older.start("0.1.0")).rejects.toThrow("Only newer");
  });

  it("starts an independent worker that survives replacement of the updater", async () => {
    const path = await home();
    const run = vi.fn<Docker>(async (args) =>
      args.includes("-p")
        ? "0.2.0"
        : args.includes("{{.Image}}")
          ? `sha256:${"c".repeat(64)}`
          : "container",
    );
    const updater = new StudioUpdater(path, run, async () => release);
    await updater.start("0.3.0");
    expect(run.mock.calls.at(-1)?.[0]).toEqual(
      expect.arrayContaining(["run", "--detach", "--rm", "apply", path]),
    );
    expect((await operation(path))?.phase).toBe("starting");
  });
});

describe("schedule and access", () => {
  it("disables automatic installation by default, but still checks for releases", async () => {
    const path = await home();
    const discover = vi.fn(async () => release);
    const updater = new StudioUpdater(path, runtime(), discover);
    const start = vi.spyOn(updater, "start").mockResolvedValue();
    await updater.tick(new Date("2026-09-15T00:00:00Z"));
    expect(discover).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it("runs only during the selected UTC hour and at most once per day", async () => {
    const path = await home();
    await saveJson(path, "settings.json", { automatic: true, hourUtc: 4 });
    const updater = new StudioUpdater(path, runtime(), async () => release);
    const start = vi.spyOn(updater, "start").mockResolvedValue();
    await updater.tick(new Date("2026-09-15T03:59:00Z"));
    expect(start).not.toHaveBeenCalled();
    await updater.tick(new Date("2026-09-15T04:01:00Z"));
    await updater.tick(new Date("2026-09-15T04:02:00Z"));
    expect(start).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith("0.3.0");
  });

  it("backs off CDN failures, retains the last release, and never installs during an outage", async () => {
    const path = await home();
    await saveJson(path, "settings.json", { automatic: true, hourUtc: 4 });
    const discover = vi
      .fn()
      .mockResolvedValueOnce(release)
      .mockRejectedValue(new ReleaseCheckError("Unavailable", 7_200_000));
    const updater = new StudioUpdater(path, runtime(), discover);
    const start = vi.spyOn(updater, "start").mockResolvedValue();
    await updater.check(new Date("2026-09-15T02:00:00Z"));
    await updater.tick(new Date("2026-09-15T04:00:00Z"));
    expect(discover).toHaveBeenCalledTimes(2);
    expect((await updater.status()).available).toEqual(release);
    expect((await updater.status()).checkError).toBeTruthy();
    await updater.check(new Date("2026-09-15T04:30:00Z"));
    await updater.tick(new Date("2026-09-15T05:59:00Z"));
    expect(discover).toHaveBeenCalledTimes(2);
    expect(start).not.toHaveBeenCalled();
    await updater.tick(new Date("2026-09-15T06:01:00Z"));
    expect(discover).toHaveBeenCalledTimes(3);
  });

  it("coalesces concurrent checks and rate-limits repeated manual requests", async () => {
    const path = await home();
    const discover = vi.fn(async () => release);
    const updater = new StudioUpdater(path, runtime(), discover);
    const now = new Date();
    await Promise.all([updater.check(now), updater.check(now)]);
    await updater.check(now);
    expect(discover).toHaveBeenCalledOnce();
  });

  it("marks interrupted workers as failed after controller restart", async () => {
    const path = await home();
    await pending(path);
    const updater = new StudioUpdater(path, vi.fn().mockResolvedValue("false"));
    await updater.tick(new Date(Date.now() + 120_000));
    expect((await operation(path))?.phase).toBe("failed");
    expect((await settings(path)).automatic).toBe(false);
  });

  it("requires a separate updater token", () => {
    const token = "secret".repeat(8);
    expect(updaterAuthorized(`Bearer ${token}`, token)).toBe(true);
    expect(updaterAuthorized(undefined, token)).toBe(false);
    expect(updaterAuthorized("Bearer telemetry-key", token)).toBe(false);
    expect(updaterAuthorized("Bearer ", "")).toBe(false);
  });
});
