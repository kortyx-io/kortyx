import { and, eq, isNull, or } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { DEFAULT_MODEL_RATE_CARDS } from "../pricing/default-rates";
import { modelRateCards } from "../schema";

export const seedDefaultModelRateCards = async (
  db: TelemetryDb,
): Promise<{ inserted: number; skipped: number }> => {
  let inserted = 0;
  let skipped = 0;

  for (const rate of DEFAULT_MODEL_RATE_CARDS) {
    const [existing] = await db
      .select({ id: modelRateCards.id })
      .from(modelRateCards)
      .where(
        and(
          isNull(modelRateCards.organizationId),
          isNull(modelRateCards.projectId),
          eq(modelRateCards.provider, rate.provider),
          eq(modelRateCards.model, rate.model),
          eq(modelRateCards.source, rate.source),
          eq(modelRateCards.pricingRef, rate.pricingRef),
        ),
      )
      .limit(1);

    if (existing) {
      skipped += 1;
      continue;
    }

    await db.insert(modelRateCards).values(rate);
    inserted += 1;
  }

  return { inserted, skipped };
};

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
