import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultStudioRuntime,
  runStudioCommand,
  type StudioRuntime,
} from "../src/studio/command";

const homes: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

const createHome = async (): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), "kortyx-studio-cli-test-"));
  homes.push(home);
  return home;
};

const createRuntime = (input?: {
  running?: boolean;
  portsAvailable?: boolean;
}): StudioRuntime & {
  calls: Array<{ command: string; args: string[]; inherit?: boolean }>;
  logs: string[];
} => {
  const calls: Array<{
    command: string;
    args: string[];
    inherit?: boolean;
  }> = [];
  const logs: string[] = [];
  return {
    calls,
    logs,
    run: async (command, args, options) => {
      calls.push({
        command,
        args,
        ...(options.inherit === undefined ? {} : { inherit: options.inherit }),
      });
      return {
        stdout:
          args.includes("ps") && args.includes("--services") && input?.running
            ? "api\nstudio\n"
            : "",
        stderr: "",
      };
    },
    portAvailable: async () => input?.portsAvailable ?? true,
    now: () => "2026-07-26T12:00:00.000Z",
    random: (bytes) => "r".repeat(Math.max(bytes, 16)),
    log: (message = "") => logs.push(message),
  };
};

const initialize = async (
  home: string,
  runtime = createRuntime(),
): Promise<typeof runtime> => {
  await runStudioCommand(["start", "--home", home], runtime);
  runtime.calls.length = 0;
  runtime.logs.length = 0;
  return runtime;
};

describe("Studio CLI arguments", () => {
  it.each([
    [[], "help"],
    [["--help"], "help"],
    [["wat"], "unknown command"],
    [["start", "--api-port", "0"], "integer between"],
    [["start", "--api-port"], "argument missing"],
    [["status", "--api-port", "6401"], "unknown option"],
    [["status", "--no-follow"], "unknown option"],
    [["status", "--confirm"], "unknown option"],
    [["start", "--wat", "yes"], "unknown option"],
  ])("handles %# invalid/help arguments", async (args, expected) => {
    const runtime = createRuntime();
    if (expected === "help") {
      await runStudioCommand(args, runtime);
      expect(runtime.logs.join("\n")).toContain("start [options]");
      return;
    }
    await expect(runStudioCommand(args, runtime)).rejects.toThrow(expected);
  });
});

describe("Studio CLI lifecycle", () => {
  it("creates secure persistent state and prints the SDK connection", async () => {
    const home = await createHome();
    const runtime = createRuntime();

    await runStudioCommand(
      [
        "start",
        "--home",
        home,
        "--studio-port",
        "7300",
        "--api-port",
        "7400",
        "--image-tag",
        "v1.2.3",
      ],
      runtime,
    );

    const config = JSON.parse(
      await readFile(join(home, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    const env = await readFile(join(home, ".env"), "utf8");
    const compose = await readFile(join(home, "compose.yml"), "utf8");
    expect(config).toMatchObject({
      version: 1,
      studioPort: 7300,
      apiPort: 7400,
      imageTag: "v1.2.3",
      createdAt: "2026-07-26T12:00:00.000Z",
    });
    expect(env).toContain("KORTYX_TELEMETRY_API_KEY=ktyx_live_telemetry");
    expect(env).toContain(
      `KORTYX_STUDIO_BASIC_AUTH_PASSWORD=${"r".repeat(24)}`,
    );
    const composeVariable = "$";
    expect(compose).toContain("ghcr.io/kortyx-io/kortyx-api");
    expect(compose).toContain(
      `"127.0.0.1:${composeVariable}{API_PORT:-6400}:6400"`,
    );
    expect(compose).toContain(
      `"127.0.0.1:${composeVariable}{STUDIO_PORT:-6300}:6300"`,
    );
    expect(compose).not.toContain("5432:5432");
    expect((await stat(join(home, ".env"))).mode & 0o777).toBe(0o600);
    expect(runtime.logs.join("\n")).toContain(
      "KORTYX_TELEMETRY_API_URL=http://localhost:7400",
    );
    expect(runtime.calls.at(-1)?.args).toEqual(
      expect.arrayContaining(["up", "--wait"]),
    );
  });

  it("is idempotent and does not rotate credentials", async () => {
    const home = await createHome();
    await initialize(home);
    const before = await readFile(join(home, ".env"), "utf8");
    const runtime = createRuntime({ running: true, portsAvailable: false });

    await runStudioCommand(
      ["start", "--home", home, "--image-tag", "v2.0.0"],
      runtime,
    );

    const after = await readFile(join(home, ".env"), "utf8");
    expect(after).toContain("KORTYX_STUDIO_IMAGE_TAG=v2.0.0");
    expect(after.replace("v2.0.0", "latest")).toBe(before);
  });

  it("fails before Docker startup when a new stack port is occupied", async () => {
    const home = await createHome();
    const runtime = createRuntime({ portsAvailable: false });
    await expect(
      runStudioCommand(["start", "--home", home], runtime),
    ).rejects.toThrow("Studio port 6300 is already in use");
    expect(runtime.calls.some(({ args }) => args.includes("up"))).toBe(false);
  });

  it("supports status, logs, credentials, stop, restart, and reset", async () => {
    const home = await createHome();
    const runtime = await initialize(home);

    await runStudioCommand(["status", "--home", home], runtime);
    expect(runtime.calls.some(({ args }) => args.includes("ps"))).toBe(true);
    expect(runtime.logs.join("\n")).toContain("Studio: http://localhost:6300");

    runtime.calls.length = 0;
    await runStudioCommand(["logs", "--home", home, "--no-follow"], runtime);
    expect(runtime.calls.at(-1)?.args).toEqual(
      expect.arrayContaining(["logs", "--tail", "200"]),
    );
    expect(runtime.calls.at(-1)?.args).not.toContain("--follow");

    runtime.calls.length = 0;
    await runStudioCommand(["logs", "--home", home], runtime);
    expect(runtime.calls.at(-1)?.args).toContain("--follow");

    runtime.calls.length = 0;
    runtime.logs.length = 0;
    await runStudioCommand(["credentials", "--home", home], runtime);
    expect(runtime.calls).toHaveLength(0);
    expect(runtime.logs.join("\n")).toContain(
      "KORTYX_TELEMETRY_API_KEY=ktyx_live_telemetry",
    );

    runtime.calls.length = 0;
    await runStudioCommand(["restart", "--home", home], runtime);
    expect(
      runtime.calls.filter(({ args }) => args.includes("--force-recreate")),
    ).toHaveLength(1);
    expect(runtime.calls.some(({ args }) => args.includes("--wait"))).toBe(
      true,
    );

    runtime.calls.length = 0;
    await runStudioCommand(["stop", "--home", home], runtime);
    expect(runtime.calls.at(-1)?.args).toContain("stop");

    await expect(
      runStudioCommand(["reset", "--home", home], runtime),
    ).rejects.toThrow("permanently deletes");
    runtime.calls.length = 0;
    await runStudioCommand(["reset", "--home", home, "--confirm"], runtime);
    expect(runtime.calls.at(-1)?.args).toEqual(
      expect.arrayContaining(["down", "--volumes", "--remove-orphans"]),
    );
  });

  it("rotates only application credentials and applies them to the database", async () => {
    const home = await createHome();
    const runtime = await initialize(home);
    const before = await readFile(join(home, ".env"), "utf8");
    runtime.random = (bytes) => "s".repeat(Math.max(bytes, 16));

    await runStudioCommand(
      ["credentials", "--home", home, "--rotate"],
      runtime,
    );

    const after = await readFile(join(home, ".env"), "utf8");
    expect(after).not.toBe(before);
    expect(after).toContain(
      `KORTYX_STUDIO_BASIC_AUTH_PASSWORD=${"s".repeat(24)}`,
    );
    expect(after).toContain(
      `KORTYX_TELEMETRY_API_KEY=ktyx_live_telemetry${"r".repeat(16)}_${"s".repeat(32)}`,
    );
    expect(after).toContain(
      `KORTYX_STUDIO_API_KEY=ktyx_live_studio${"r".repeat(16)}_${"s".repeat(32)}`,
    );
    for (const preserved of ["POSTGRES_PASSWORD", "KORTYX_API_KEY_PEPPER"]) {
      const value = before
        .split("\n")
        .find((entry) => entry.startsWith(`${preserved}=`));
      expect(value).toBeTruthy();
      expect(after).toContain(value as string);
    }
    expect(
      runtime.calls.some(
        ({ args }) =>
          args.includes("run") &&
          args.includes("--rm") &&
          args.includes("db-init"),
      ),
    ).toBe(true);
    expect(
      runtime.calls.some(
        ({ args }) =>
          args.includes("--force-recreate") &&
          args.includes("api") &&
          args.includes("studio"),
      ),
    ).toBe(true);
    expect(runtime.logs.join("\n")).toContain(
      "previous browser password and API keys are no longer valid",
    );
  });

  it("restores previous credentials if rotation cannot be applied", async () => {
    const home = await createHome();
    const runtime = await initialize(home);
    const before = await readFile(join(home, ".env"), "utf8");
    const originalRun = runtime.run;
    let failed = false;
    runtime.run = async (command, args, options) => {
      if (!failed && args.includes("run") && args.includes("db-init")) {
        failed = true;
        throw new Error("bootstrap failed");
      }
      return await originalRun(command, args, options);
    };

    await expect(
      runStudioCommand(["credentials", "--home", home, "--rotate"], runtime),
    ).rejects.toThrow("bootstrap failed");

    expect(await readFile(join(home, ".env"), "utf8")).toBe(before);
    expect(
      runtime.calls.filter(
        ({ args }) => args.includes("run") && args.includes("db-init"),
      ),
    ).toHaveLength(1);
    expect(runtime.logs.join("\n")).toContain(
      "Restoring the previous credentials",
    );
  });

  it("reports missing and invalid local state clearly", async () => {
    const home = await createHome();
    const runtime = createRuntime();
    await expect(
      runStudioCommand(["status", "--home", home], runtime),
    ).rejects.toThrow('Run "kortyx studio start" first');

    await writeFile(join(home, "config.json"), '{"version":99}\n');
    await expect(
      runStudioCommand(["status", "--home", home], runtime),
    ).rejects.toThrow("Unsupported or invalid Studio config");
  });

  it("generates deployment credentials without Docker or local state", async () => {
    const home = await createHome();
    const runtime = createRuntime();

    await runStudioCommand(
      ["credentials", "--home", home, "--generate"],
      runtime,
    );

    expect(runtime.calls).toHaveLength(0);
    expect(runtime.logs.join("\n")).toContain("KORTYX_API_KEY_PEPPER=");
    expect(runtime.logs.join("\n")).toContain(
      "KORTYX_TELEMETRY_API_KEY=ktyx_live_telemetry",
    );
    expect(runtime.logs.join("\n")).toContain("were not persisted");
    await expect(stat(join(home, ".env"))).rejects.toThrow();
    await expect(
      runStudioCommand(
        ["credentials", "--home", home, "--generate", "--rotate"],
        runtime,
      ),
    ).rejects.toThrow("either --generate or --rotate");
  });

  it("does not replace a path that cannot be read as an env file", async () => {
    const home = await createHome();
    await mkdir(join(home, ".env"));
    await expect(
      runStudioCommand(["start", "--home", home], createRuntime()),
    ).rejects.toThrow();
  });

  it("rejects malformed or incomplete persisted environments", async () => {
    const malformedHome = await createHome();
    await initialize(malformedHome);
    await writeFile(join(malformedHome, ".env"), "not-an-env-entry\n");
    await expect(
      runStudioCommand(
        ["credentials", "--home", malformedHome],
        createRuntime(),
      ),
    ).rejects.toThrow("Invalid environment entry");

    const incompleteHome = await createHome();
    await initialize(incompleteHome);
    await writeFile(
      join(incompleteHome, ".env"),
      "KORTYX_COMPOSE_PROJECT_NAME=kortyx-studio\n",
    );
    await expect(
      runStudioCommand(
        ["credentials", "--home", incompleteHome],
        createRuntime(),
      ),
    ).rejects.toThrow("invalid Studio environment");
  });

  it.each([
    [["start", "--api-port", "6300"], "ports must be different"],
    [["start", "--image-tag", "bad tag"], "Image tag"],
    [["start", "--username", "bad user"], "Username"],
    [["start", "--project-name", "Bad_Name"], "project name"],
  ])("rejects unsafe stack configuration %#", async (args, expected) => {
    const home = await createHome();
    await expect(
      runStudioCommand([...args, "--home", home], createRuntime()),
    ).rejects.toThrow(expected);
  });
});

describe("default Studio runtime", () => {
  it("runs child processes and reports failures", async () => {
    await expect(
      defaultStudioRuntime.run(
        process.execPath,
        ["-e", "process.stdout.write('out'); process.stderr.write('err')"],
        { inherit: false },
      ),
    ).resolves.toEqual({ stdout: "out", stderr: "err" });
    await expect(
      defaultStudioRuntime.run(process.execPath, ["-e", ""], {
        cwd: process.cwd(),
        inherit: false,
      }),
    ).resolves.toEqual({ stdout: "", stderr: "" });
    await expect(
      defaultStudioRuntime.run(process.execPath, ["-e", "process.exit(0)"], {
        inherit: true,
      }),
    ).resolves.toEqual({ stdout: "", stderr: "" });
    await expect(
      defaultStudioRuntime.run(
        process.execPath,
        ["-e", "process.stderr.write('broken'); process.exit(2)"],
        { inherit: false },
      ),
    ).rejects.toThrow("broken");
    await expect(
      defaultStudioRuntime.run("definitely-not-a-kortyx-command", [], {
        inherit: false,
      }),
    ).rejects.toThrow("Install and start Docker Desktop");
  });

  it("checks port availability and supplies secure runtime values", async () => {
    await expect(defaultStudioRuntime.portAvailable(0)).resolves.toBe(true);

    const server = createServer();
    await new Promise<void>((resolvePromise) => {
      server.listen({ host: "127.0.0.1", port: 0 }, resolvePromise);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP address.");
    }
    await expect(
      defaultStudioRuntime.portAvailable(address.port),
    ).resolves.toBe(false);
    await new Promise<void>((resolvePromise) =>
      server.close(() => resolvePromise()),
    );

    expect(Date.parse(defaultStudioRuntime.now())).not.toBeNaN();
    expect(defaultStudioRuntime.random(12).length).toBeGreaterThan(10);
    const consoleSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    defaultStudioRuntime.log("ready");
    expect(consoleSpy).toHaveBeenCalledWith("ready");
  });
});
