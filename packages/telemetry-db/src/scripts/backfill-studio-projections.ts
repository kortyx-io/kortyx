import { createTelemetryDbClient } from "../client";
import { backfillStudioProjections } from "../repositories/studio-projections";

const databaseUrl = process.env.DATABASE_URL;

const main = async (): Promise<void> => {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const client = createTelemetryDbClient(databaseUrl);
  try {
    const result = await backfillStudioProjections(client.db);
    console.log(
      `Studio projection backfill complete: ${result.projects} projects, ${result.runs} run writes, ${result.sessions} session writes, ${result.interrupts} interrupt writes.`,
    );
  } finally {
    await client.close();
  }
};

void main();
