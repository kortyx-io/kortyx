import { createTelemetryDbClient, seedDefaultModelRateCards } from "../index";

const databaseUrl = process.env.DATABASE_URL;

const main = async (): Promise<void> => {
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const client = createTelemetryDbClient(databaseUrl);
  try {
    const result = await seedDefaultModelRateCards(client.db);
    console.log(
      `Seeded model rate cards. Inserted: ${result.inserted}. Skipped: ${result.skipped}.`,
    );
  } finally {
    await client.close();
  }
};

void main();
