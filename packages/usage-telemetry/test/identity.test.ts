import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

let home: string | undefined;
afterEach(async () => {
  vi.doUnmock("node:os");
  vi.unstubAllEnvs();
  vi.resetModules();
  if (home) await rm(home, { recursive: true, force: true });
});
it("creates a private installation UUID only at delivery and reuses it across module lifetimes", async () => {
  home = await mkdtemp(join(tmpdir(), "kortyx-usage-"));
  vi.doMock("node:os", () => ({ homedir: () => home }));
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("KORTYX_USAGE_TELEMETRY_DISABLED", "0");
  const identities: string[] = [];
  const transport = vi.fn(async (_records: unknown, identity: string) => {
    identities.push(identity);
  });
  const { createNodeUsageTelemetry } = await import("../src/node");
  const client = createNodeUsageTelemetry({
    context: { product: "sdk", component: "agent", version: "1.0.0" },
    transport,
  });
  client.feature("sdk.initialize");
  const file = join(home, ".config", "kortyx", "usage-id");
  await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
  await client.flush();
  client.dispose();
  const saved = await readFile(file, "utf8");
  expect(saved).toMatch(/^[a-f0-9-]{36}$/);
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect((await stat(join(home, ".config", "kortyx"))).mode & 0o777).toBe(
    0o700,
  );
  vi.resetModules();
  const { createNodeUsageTelemetry: again } = await import("../src/node");
  const second = again({
    context: { product: "sdk", component: "agent", version: "1.0.0" },
    transport,
  });
  second.feature("sdk.initialize");
  await second.flush();
  second.dispose();
  expect(identities).toEqual([saved, saved]);
});
