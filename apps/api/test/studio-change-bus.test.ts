import type { StudioChange } from "@kortyx/telemetry-contracts";
import type { TelemetrySqlClient } from "@kortyx/telemetry-db";
import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryStudioChangeBus,
  createPostgresStudioChangeBus,
} from "../src/realtime/studio-change-bus";

const change = (
  projectId: string,
  changeId = `change-${projectId}`,
): StudioChange => ({
  schemaVersion: 1,
  changeId,
  emittedAt: "2026-01-01T00:00:00.000Z",
  organizationId: "org-1",
  projectId,
  resources: ["runs"],
});

describe("Studio change bus", () => {
  it("isolates subscribers by organization and project", () => {
    const bus = createInMemoryStudioChangeBus();
    const projectA = vi.fn();
    const projectB = vi.fn();
    bus.subscribe(
      { organizationId: "org-1", projectId: "project-a" },
      projectA,
    );
    bus.subscribe(
      { organizationId: "org-1", projectId: "project-b" },
      projectB,
    );

    bus.publish(change("project-a"));

    expect(projectA).toHaveBeenCalledWith(change("project-a"));
    expect(projectB).not.toHaveBeenCalled();
  });

  it("creates one PostgreSQL listener and ignores malformed messages", async () => {
    let notify: ((payload: string) => void) | undefined;
    const unlisten = vi.fn(async () => undefined);
    const listen = vi.fn(
      async (_channel: string, callback: (payload: string) => void) => {
        notify = callback;
        return { unlisten };
      },
    );
    const bus = createPostgresStudioChangeBus({
      listen,
    } as unknown as TelemetrySqlClient);
    const subscriber = vi.fn();
    bus.subscribe(
      { organizationId: "org-1", projectId: "project-a" },
      subscriber,
    );

    await Promise.all([bus.start(), bus.start()]);
    notify?.("not-json");
    notify?.(JSON.stringify({ payload: "not-a-change" }));
    notify?.(JSON.stringify(change("project-a")));

    expect(listen).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(change("project-a"));

    await bus.close();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
