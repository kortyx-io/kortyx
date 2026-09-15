import { migrateDatabase } from "./migration-runner";

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  await migrateDatabase({ databaseUrl });
};

void main();
