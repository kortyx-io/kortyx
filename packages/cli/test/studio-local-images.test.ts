import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { startStudio } from "../src/studio/local-stack";
import type { StudioRuntime } from "../src/studio/types";

afterEach(() => vi.unstubAllEnvs());
it("starts locally built Docker images without attempting a registry pull", async () => {
  vi.stubEnv("KORTYX_STUDIO_PULL_POLICY", "missing");
  const home = await mkdtemp(join(tmpdir(), "kortyx-local-image-test-"));
  const calls: string[][] = [];
  const runtime: StudioRuntime = {
    run: async (_command, args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    },
    portAvailable: async () => true,
    now: () => new Date().toISOString(),
    random: (bytes) => "a".repeat(bytes * 2),
    log: () => {},
  };
  try {
    await startStudio(
      { home, imageTag: "evals-local", projectName: "eval-test" },
      runtime,
    );
    expect(
      calls.filter((args) => args[0] === "image" && args[1] === "inspect"),
    ).toHaveLength(2);
    expect(calls.some((args) => args[0] === "pull")).toBe(false);
    expect(
      calls.some((args) => args[0] === "compose" && args.includes("up")),
    ).toBe(true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
