import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type {
  StudioRelease,
  StudioUpdateStatus,
} from "@kortyx/telemetry-contracts";
import {
  newerStudioVersion,
  StudioReleaseSchema,
  StudioReleaseVersionSchema,
  StudioUpdateSettingsSchema,
  studioUpdateRunning,
} from "@kortyx/telemetry-contracts";
import { z } from "zod";
import type { Docker } from "./docker";
import { composeArgs, docker, runningVersion } from "./docker";
import { failUpdate } from "./engine";
import { latestStudioRelease, ReleaseCheckError } from "./releases";
import {
  environment,
  operation,
  readJson,
  saveJson,
  settings,
  updatesPath,
} from "./storage";

type Check = {
  checkedAt: string | null;
  release: StudioRelease | null;
  error: string | null;
  failures?: number;
  nextCheckAt?: string;
  retryNotBefore?: string;
};
const initialCheck: Check = { checkedAt: null, release: null, error: null };

export class StudioUpdater {
  constructor(
    readonly home: string,
    readonly run: Docker = docker,
    readonly discover = latestStudioRelease,
  ) {}

  private checking: Promise<Check> | null = null;

  async check(now = new Date()): Promise<Check> {
    if (this.checking) return this.checking;
    this.checking = this.performCheck(now);
    try {
      return await this.checking;
    } finally {
      this.checking = null;
    }
  }

  private async performCheck(now: Date): Promise<Check> {
    const previous = await readJson(
      updatesPath(this.home, "check.json"),
      initialCheck,
    );
    // Coalesce rapid manual checks and respect CDN Retry-After responses.
    if (
      previous.retryNotBefore &&
      now.getTime() < Date.parse(previous.retryNotBefore)
    )
      return previous;
    let result: Check;
    const checkedAt = now.toISOString();
    try {
      result = {
        checkedAt,
        release: await this.discover(),
        error: null,
        failures: 0,
        nextCheckAt: new Date(
          now.getTime() + 60 * 60_000 + Math.random() * 5 * 60_000,
        ).toISOString(),
        retryNotBefore: new Date(now.getTime() + 30_000).toISOString(),
      };
    } catch (error) {
      const failures = Math.min((previous.failures ?? 0) + 1, 10);
      const retryDelay = Math.max(
        Math.min(5 * 60_000 * 2 ** (failures - 1), 6 * 60 * 60_000) +
          Math.random() * 60_000,
        error instanceof ReleaseCheckError ? error.retryAfterMs : 0,
      );
      result = {
        checkedAt,
        release: previous.release,
        error:
          "Could not check published releases. Retrying later; no update was started.",
        failures,
        nextCheckAt: new Date(now.getTime() + retryDelay).toISOString(),
        retryNotBefore: new Date(now.getTime() + retryDelay).toISOString(),
      };
    }
    await saveJson(this.home, "check.json", result);
    return result;
  }

  async status(): Promise<StudioUpdateStatus> {
    const [current, check, preferences, active] = await Promise.all([
      runningVersion(this.home, this.run).catch(() => null),
      readJson(updatesPath(this.home, "check.json"), initialCheck),
      settings(this.home),
      operation(this.home),
    ]);
    return {
      current,
      available:
        check.release &&
        current &&
        StudioReleaseVersionSchema.safeParse(current).success &&
        newerStudioVersion(check.release.version, current)
          ? check.release
          : null,
      checkedAt: check.checkedAt,
      checkError: check.error,
      settings: preferences,
      operation: active,
    };
  }

  async workerName(id: string): Promise<string> {
    const env = await environment(this.home);
    const project = env.KORTYX_COMPOSE_PROJECT_NAME;
    if (!project || !/^[a-z0-9][a-z0-9_-]*$/.test(project))
      throw new Error("Invalid Studio project name.");
    return `${project}-update-${id}`;
  }

  async start(version: string): Promise<void> {
    StudioReleaseVersionSchema.parse(version);
    await mkdir(updatesPath(this.home, ""), { recursive: true, mode: 0o700 });
    try {
      await mkdir(updatesPath(this.home, "lock"), { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new Error("An update is already running.");
      throw error;
    }
    let recorded = false;
    try {
      const release = await this.discover();
      if (!release || release.version !== version)
        throw new Error(
          "The available release changed. Check for updates again.",
        );
      const current = await runningVersion(this.home, this.run);
      if (!newerStudioVersion(release.version, current))
        throw new Error("Only newer Studio releases can be installed.");
      const env = await environment(this.home);
      if (
        (env.KORTYX_API_IMAGE_REF &&
          !StudioReleaseSchema.shape.api.safeParse(env.KORTYX_API_IMAGE_REF)
            .success) ||
        (env.KORTYX_STUDIO_IMAGE_REF &&
          !StudioReleaseSchema.shape.studio.safeParse(
            env.KORTYX_STUDIO_IMAGE_REF,
          ).success) ||
        (env.KORTYX_API_IMAGE &&
          env.KORTYX_API_IMAGE !== "ghcr.io/kortyx-io/kortyx-api") ||
        (env.KORTYX_STUDIO_IMAGE &&
          env.KORTYX_STUDIO_IMAGE !== "ghcr.io/kortyx-io/kortyx-studio")
      ) {
        throw new Error(
          "Automatic update management requires official Studio images.",
        );
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      await saveJson(this.home, "operation.json", {
        id,
        from: current,
        release,
        phase: "starting",
        startedAt: now,
        updatedAt: now,
        backup: null,
        messages: [`Preparing update from v${current} to v${version}.`],
      });
      recorded = true;
      const container = await this.run(
        composeArgs(this.home, ["ps", "-q", "updater"]),
      );
      const image = await this.run([
        "inspect",
        "--format",
        "{{.Image}}",
        container,
      ]);
      if (!/^sha256:[a-f0-9]{64}$/.test(image))
        throw new Error("Could not identify the updater image.");
      await this.run([
        "run",
        "--detach",
        "--rm",
        "--name",
        await this.workerName(id),
        "--network",
        "none",
        "--mount",
        `type=bind,source=${this.home},target=${this.home}`,
        "--mount",
        "type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock",
        image,
        "node",
        "apps/api/dist/updater.js",
        "apply",
        this.home,
        id,
      ]);
    } catch (error) {
      if (recorded)
        await failUpdate(
          this.home,
          error instanceof Error
            ? error.message
            : "Could not start update worker.",
        );
      await rm(updatesPath(this.home, "lock"), {
        recursive: true,
        force: true,
      });
      throw error;
    }
  }

  async tick(now = new Date()): Promise<void> {
    const active = await operation(this.home);
    if (studioUpdateRunning(active)) {
      // The controller may restart during an update. A detached worker survives it.
      if (active && now.getTime() - Date.parse(active.updatedAt) > 60_000) {
        const running = await this.run([
          "inspect",
          "--format",
          "{{.State.Running}}",
          await this.workerName(active.id),
        ]).catch(() => "false");
        if (running !== "true") {
          await failUpdate(
            this.home,
            "The update worker stopped unexpectedly. Inspect your backup and service logs before recovery.",
          );
          await rm(updatesPath(this.home, "lock"), {
            recursive: true,
            force: true,
          });
        }
      }
      return;
    }
    const abandonedLock = await stat(updatesPath(this.home, "lock")).catch(
      () => null,
    );
    if (abandonedLock && now.getTime() - abandonedLock.mtimeMs > 120_000) {
      await rm(updatesPath(this.home, "lock"), {
        recursive: true,
        force: true,
      });
    }
    let check = await readJson(
      updatesPath(this.home, "check.json"),
      initialCheck,
    );
    if (
      !check.checkedAt ||
      (check.nextCheckAt
        ? now.getTime() >= Date.parse(check.nextCheckAt)
        : now.getTime() - Date.parse(check.checkedAt) >= 60 * 60_000)
    )
      check = await this.check(now);
    const preferences = await settings(this.home);
    const day = now.toISOString().slice(0, 10);
    const attempted = await readJson<string | null>(
      updatesPath(this.home, "automatic-day.json"),
      null,
    );
    if (
      !preferences.automatic ||
      preferences.hourUtc !== now.getUTCHours() ||
      attempted === day ||
      check.error ||
      !check.release
    )
      return;
    const current = await runningVersion(this.home, this.run);
    if (
      !StudioReleaseVersionSchema.safeParse(current).success ||
      !newerStudioVersion(check.release.version, current)
    )
      return;
    await saveJson(this.home, "automatic-day.json", day);
    await this.start(check.release.version);
  }
}

export function updaterAuthorized(
  actual: string | undefined,
  token: string,
): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return (
    token.length >= 32 &&
    timingSafeEqual(digest(actual ?? ""), digest(`Bearer ${token}`))
  );
}

export async function serveUpdater(home: string): Promise<void> {
  const updater = new StudioUpdater(home);
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await updater.tick();
    } catch {
      console.error(
        "Studio update check failed; retrying on the next scheduled check.",
      );
    } finally {
      ticking = false;
    }
  };
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    const send = (status: number, data: unknown) => {
      response.writeHead(status);
      response.end(JSON.stringify(data));
    };
    if (request.url === "/health" && request.method === "GET") {
      send(200, { ok: true });
      return;
    }
    try {
      const env = await environment(home);
      if (
        !updaterAuthorized(
          request.headers.authorization,
          env.KORTYX_STUDIO_UPDATE_TOKEN ?? "",
        )
      ) {
        send(401, { error: "Unauthorized" });
        return;
      }
      if (request.url === "/status" && request.method === "GET") {
        send(200, await updater.status());
        return;
      }
      if (
        request.method !== "POST" ||
        request.headers["content-type"] !== "application/json"
      ) {
        send(405, { error: "Unsupported request" });
        return;
      }
      let body = "";
      for await (const chunk of request) {
        body += String(chunk);
        if (body.length > 4096) {
          send(413, { error: "Request too large" });
          return;
        }
      }
      const data: unknown = JSON.parse(body || "{}");
      if (request.url === "/check") await updater.check();
      else if (request.url === "/settings")
        await saveJson(
          home,
          "settings.json",
          StudioUpdateSettingsSchema.parse(data),
        );
      else if (request.url === "/update")
        await updater.start(
          z.object({ version: StudioReleaseVersionSchema }).parse(data).version,
        );
      else {
        send(404, { error: "Not found" });
        return;
      }
      send(200, await updater.status());
    } catch (error) {
      send(400, {
        error:
          error instanceof z.ZodError
            ? "Invalid update request or release information."
            : error instanceof Error
              ? error.message
              : "Update request failed.",
      });
    }
  });
  server.listen(6410, "0.0.0.0");
  // Spread first checks after fleet restarts; manual checks remain immediate.
  setTimeout(
    () => {
      void tick();
      setInterval(() => {
        void tick();
      }, 60_000);
    },
    Math.random() * 5 * 60_000,
  );
}
