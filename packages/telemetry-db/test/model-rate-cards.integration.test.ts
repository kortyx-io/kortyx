import { randomUUID } from "node:crypto";
import type { KortyxTelemetryEvent } from "@kortyx/telemetry-contracts";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTelemetryDbClient, type TelemetryDb } from "../src/client";
import { DEFAULT_MODEL_RATE_CARDS } from "../src/pricing/default-rates";
import { seedDefaultModelRateCards } from "../src/repositories/model-rate-cards";
import { listStudioRuns } from "../src/repositories/studio-lists";
import { backfillStudioProjections } from "../src/repositories/studio-projections";
import { ingestTelemetryEvents } from "../src/repositories/telemetry-events";
import {
  modelRateCards,
  organizations,
  projectEnvironments,
  projects,
} from "../src/schema";

const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("default model rate reconciliation", () => {
  it("supports dry runs, corrections, versioned identities, idempotence, and scoped cost backfills", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required.");
    const client = createTelemetryDbClient(databaseUrl);
    const rollback = new Error("rollback test fixtures");
    try {
      await client.db.transaction(async (transaction) => {
        const db = transaction as TelemetryDb;
        await db
          .delete(modelRateCards)
          .where(
            and(
              isNull(modelRateCards.projectId),
              eq(modelRateCards.source, "default-rate-card"),
            ),
          );
        const [org] = await db
          .insert(organizations)
          .values({ name: `pricing-test-${randomUUID()}` })
          .returning();
        if (!org) throw new Error("Organization was not created.");
        const [project] = await db
          .insert(projects)
          .values({ organizationId: org.id, name: "pricing" })
          .returning();
        if (!project) throw new Error("Project was not created.");
        const scope = { organizationId: org.id, projectId: project.id };
        await db.insert(projectEnvironments).values({ ...scope, name: "test" });
        const legacy = DEFAULT_MODEL_RATE_CARDS.find(
          (rate) => rate.pricingRef === "openai-pricing-gpt-4.1-mini-2026-07",
        );
        const haiku = DEFAULT_MODEL_RATE_CARDS.find(
          (rate) =>
            rate.pricingRef === "anthropic-haiku-4-5-launch-pricing-2026-07",
        );
        if (!legacy || !haiku) throw new Error("Legacy rates are missing.");
        const [incorrect] = await db
          .insert(modelRateCards)
          .values({
            ...haiku,
            unitPrices: haiku.unitPrices.filter(
              (price) =>
                price.usageType === "input" || price.usageType === "output",
            ),
          })
          .returning();
        await db.insert(modelRateCards).values(legacy);
        const [history] = await db
          .insert(modelRateCards)
          .values({
            ...legacy,
            effectiveFrom: new Date("2026-01-01"),
            unitPrices: [],
            metadata: { historical: true },
          })
          .returning();
        const [custom] = await db
          .insert(modelRateCards)
          .values({
            ...legacy,
            ...scope,
            model: "contract-model",
            unitPrices: [],
            metadata: { negotiated: true },
          })
          .returning();
        if (!incorrect || !history || !custom)
          throw new Error("Rate fixtures were not created.");
        const runId = randomUUID();
        const sessionId = randomUUID();
        const facts = [
          { type: "span.started", payload: { name: "kortyx.run" } },
          ...["gpt-4.1-mini", "gpt-6-astra"].map((model) => ({
            type: "generation.completed",
            payload: {
              provider: "openai",
              model,
              usage: { input: 1000, output: 100 },
            },
          })),
          {
            type: "span.ended",
            payload: { name: "kortyx.run", outcome: "completed" },
          },
        ].map((fact, index) => ({
          ...fact,
          schemaVersion: 1,
          eventId: randomUUID(),
          occurredAt: new Date(
            Date.parse("2026-09-17T08:00:00Z") + index,
          ).toISOString(),
          environment: "test",
          service: { name: "pricing-test" },
          correlation: {
            runId,
            sessionId,
            workflowId: "pricing",
          },
        })) as KortyxTelemetryEvent[];
        await ingestTelemetryEvents(db, { ...scope, events: facts });
        const listing = () =>
          listStudioRuns(db, {
            ...scope,
            query: { range: "All time", q: runId },
          });
        expect((await listing()).items[0]).toMatchObject({
          cost: null,
          pricingStatus: "unpriced",
        });
        const count = DEFAULT_MODEL_RATE_CARDS.length;
        const expected = { inserted: count - 2, updated: 1, skipped: 1 };
        expect(await seedDefaultModelRateCards(db, { dryRun: true })).toEqual(
          expected,
        );
        expect(await seedDefaultModelRateCards(db)).toEqual(expected);
        expect(await seedDefaultModelRateCards(db)).toEqual({
          inserted: 0,
          updated: 0,
          skipped: count,
        });
        const [corrected] = await db
          .select()
          .from(modelRateCards)
          .where(eq(modelRateCards.id, incorrect.id));
        expect(corrected?.unitPrices).toEqual(haiku.unitPrices);
        for (const row of [history, custom]) {
          const [preserved] = await db
            .select()
            .from(modelRateCards)
            .where(eq(modelRateCards.id, row.id));
          expect(preserved).toEqual(row);
        }
        // Seeding updates rates only; materialized costs require an explicit backfill.
        expect((await listing()).items[0]?.cost).toBeNull();
        await backfillStudioProjections(db, scope);
        const refreshed = (await listing()).items[0];
        expect(refreshed).toMatchObject({
          currency: "USD",
          pricingStatus: "priced",
        });
        expect(refreshed?.cost).toBeCloseTo(0.01556, 6);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await client.close();
    }
  });
});
