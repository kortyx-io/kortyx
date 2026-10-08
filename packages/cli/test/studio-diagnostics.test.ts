import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DIAGNOSTIC_LIMITS } from "@kortyx/telemetry-contracts";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerStudioReadCommands } from "../src/studio/read-command";

const id = randomUUID();
const content = {
  schemaVersion: 1,
  data: {
    type: "Error",
    message: "provider rejected",
    responseBody: "X".repeat(60000),
  },
  capture: { status: "complete", omissions: [], redactions: [] },
};
const bytes = JSON.stringify(content);
const checksum = createHash("sha256").update(bytes).digest("hex");
const value = {
  manifest: {
    schemaVersion: 1,
    diagnosticId: id,
    occurrenceId: randomUUID(),
    occurredAt: new Date().toISOString(),
    environment: "test",
    service: { name: "test" },
    correlation: { runId: "run", nodeId: "brief" },
    handled: false,
    severity: "error",
    mechanism: "span",
    summary: { type: "Error", message: "provider rejected" },
    captureStatus: "complete",
    byteLength: Buffer.byteLength(bytes),
    partCount: Math.ceil(
      Buffer.byteLength(bytes) / DIAGNOSTIC_LIMITS.partBytes,
    ),
    checksum,
  },
  state: "available",
  receivedParts: 1,
  expiresAt: new Date().toISOString(),
  content,
  contentChecksum: checksum,
  contentByteLength: Buffer.byteLength(bytes),
};
afterEach(() => vi.unstubAllEnvs());
const command = (response: unknown, log: (value: string) => void) => {
  vi.stubEnv("KORTYX_DIAGNOSTIC_TEST_KEY", "ktyx_test_fixture_readonly");
  const program = new Command();
  registerStudioReadCommands(program.command("studio"), log, async () =>
    Response.json(response),
  );
  return program;
};
const args = (action: string) => [
  "studio",
  "diagnostics",
  action,
  id,
  "--environment",
  "test",
  "--api-url",
  "https://api.test",
  "--api-key-env",
  "KORTYX_DIAGNOSTIC_TEST_KEY",
  "--json",
];
describe("native CLI diagnostics", () => {
  it("keeps get bounded and correlated", async () => {
    const log = vi.fn();
    await command(value, log).parseAsync(args("get"), { from: "user" });
    const summary = JSON.parse(log.mock.calls[0]?.[0] ?? "{}");
    expect(summary.content).toBeUndefined();
    expect(summary.manifest.correlation).toEqual({
      runId: "run",
      nodeId: "brief",
    });
    expect(summary.capture.status).toBe("complete");
    expect(JSON.stringify(summary).length).toBeLessThan(2000);
  });
  it("writes exact verified bytes privately and refuses overwrites", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kortyx-cli-diagnostic-"));
    try {
      const file = join(directory, "diagnostic.json");
      const log = vi.fn();
      await command(value, log).parseAsync(
        [...args("download"), "--output", file],
        { from: "user" },
      );
      expect(await readFile(file, "utf8")).toBe(bytes);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(log.mock.calls[0]?.[0] ?? "{}").file).toBe(file);
      await writeFile(file, "keep");
      await expect(
        command(value, log).parseAsync(
          [...args("download"), "--output", file],
          { from: "user" },
        ),
      ).rejects.toMatchObject({ code: "EEXIST" });
      expect(await readFile(file, "utf8")).toBe("keep");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("rejects incomplete and corrupted artifacts", async () => {
    await expect(
      command(
        { ...value, state: "incomplete", content: null },
        vi.fn(),
      ).parseAsync(args("download"), { from: "user" }),
    ).rejects.toMatchObject({ code: "diagnostic_incomplete" });
    await expect(
      command(
        { ...value, contentChecksum: "0".repeat(64) },
        vi.fn(),
      ).parseAsync(args("download"), { from: "user" }),
    ).rejects.toMatchObject({ code: "diagnostic_integrity_failed" });
  });
});
