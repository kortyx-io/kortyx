import { isDeepStrictEqual } from "node:util";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { DEFAULT_MODEL_RATE_CARDS } from "../pricing/default-rates";
import { modelRateCards } from "../schema";

/** Reconcile verified identities; new effective dates insert historical versions. */
export const seedDefaultModelRateCards = async (
  db: TelemetryDb,
  options: { dryRun?: boolean } = {},
): Promise<{ inserted: number; updated: number; skipped: number }> =>
  db.transaction(async (tx) => {
    // Serialize concurrent seeders. The partial unique index also protects inserts.
    await tx.execute(sql`select pg_advisory_xact_lock(724013829)`);
    const existing = await tx
      .select()
      .from(modelRateCards)
      .where(
        and(
          isNull(modelRateCards.organizationId),
          isNull(modelRateCards.projectId),
        ),
      );
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    for (const rate of DEFAULT_MODEL_RATE_CARDS) {
      const match = existing.find(
        (row) =>
          row.provider === rate.provider &&
          row.model === rate.model &&
          row.source === rate.source &&
          row.pricingRef === rate.pricingRef &&
          row.effectiveFrom.getTime() === rate.effectiveFrom.getTime(),
      );
      const values = {
        modality: rate.modality,
        currency: rate.currency,
        unitPrices: rate.unitPrices,
        metadata: rate.metadata ?? null,
        effectiveTo: rate.effectiveTo ?? null,
      };
      if (
        match &&
        Object.entries(values).every(([key, value]) =>
          isDeepStrictEqual(match[key as keyof typeof match], value),
        )
      ) {
        skipped += 1;
        continue;
      }
      if (match) updated += 1;
      else inserted += 1;
      if (!options.dryRun)
        await tx
          .insert(modelRateCards)
          .values(rate)
          .onConflictDoUpdate({
            target: [
              modelRateCards.provider,
              modelRateCards.model,
              modelRateCards.source,
              modelRateCards.pricingRef,
              modelRateCards.effectiveFrom,
            ],
            targetWhere: sql`${modelRateCards.organizationId} is null and ${modelRateCards.projectId} is null`,
            set: values,
          });
    }
    return { inserted, updated, skipped };
  });

export const listApplicableModelRateCards = async (
  db: TelemetryDb,
  input: { organizationId: string; projectId: string },
) =>
  db
    .select()
    .from(modelRateCards)
    .where(
      or(
        and(
          eq(modelRateCards.organizationId, input.organizationId),
          eq(modelRateCards.projectId, input.projectId),
        ),
        and(
          isNull(modelRateCards.organizationId),
          isNull(modelRateCards.projectId),
        ),
      ),
    );
