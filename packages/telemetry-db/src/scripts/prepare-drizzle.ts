import { prepareDatabaseForDrizzle } from "./legacy-drizzle-preparation";

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const result = await prepareDatabaseForDrizzle({ databaseUrl });
  console.log(`Drizzle preparation: ${result}.`);
};

void main();
