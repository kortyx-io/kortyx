import { createTelemetryDbClient, seedDefaultModelRateCards } from "../index";

const databaseUrl = process.env.DATABASE_URL;

const main = async (): Promise<void> => {
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const client = createTelemetryDbClient(databaseUrl);
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--dry-run"))
      throw new Error("Usage: seed-model-rates [--dry-run]");
    const dryRun = args.includes("--dry-run");
    const result = await seedDefaultModelRateCards(client.db, { dryRun });
    console.log(
      `Model rate cards${dryRun ? " (dry run)" : ""}. Inserted: ${result.inserted}. Updated: ${result.updated}. Skipped: ${result.skipped}.`,
    );
  } finally {
    await client.close();
  }
};

void main();
