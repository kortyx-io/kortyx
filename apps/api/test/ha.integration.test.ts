import { randomUUID } from "node:crypto";
import type { StudioChange } from "@kortyx/telemetry-contracts";
import {
  createTelemetryDbClient,
  STUDIO_CHANGE_CHANNEL,
} from "@kortyx/telemetry-db";
import { describe, expect, it, vi } from "vitest";
import { createPostgresStudioChangeBus } from "../src/realtime/studio-change-bus";

const databaseUrl = process.env.DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

integration("two API replicas", () => {
  it("delivers committed invalidations to subscribers on both replicas", async () => {
    const firstClient = createTelemetryDbClient(databaseUrl as string);
    const secondClient = createTelemetryDbClient(databaseUrl as string);
    const firstBus = createPostgresStudioChangeBus(firstClient.sql);
    const secondBus = createPostgresStudioChangeBus(secondClient.sql);
    const firstSubscriber = vi.fn();
    const secondSubscriber = vi.fn();
    const projectId = `project-${randomUUID()}`;
    const change: StudioChange = {
      schemaVersion: 1,
      changeId: randomUUID(),
      emittedAt: new Date().toISOString(),
      organizationId: "ha-integration",
      projectId,
      resources: ["runs"],
    };

    firstBus.subscribe(
      { organizationId: change.organizationId, projectId },
      firstSubscriber,
    );
    secondBus.subscribe(
      { organizationId: change.organizationId, projectId },
      secondSubscriber,
    );

    try {
      await Promise.all([firstBus.start(), secondBus.start()]);
      await firstClient.sql`
        SELECT pg_notify(${STUDIO_CHANGE_CHANNEL}, ${JSON.stringify(change)})
      `;

      await vi.waitFor(() => {
        expect(firstSubscriber).toHaveBeenCalledWith(change);
        expect(secondSubscriber).toHaveBeenCalledWith(change);
      });
    } finally {
      await Promise.all([firstBus.close(), secondBus.close()]);
      await Promise.all([firstClient.close(), secondClient.close()]);
    }
  });
});
