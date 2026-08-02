import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type TelemetryDb = PostgresJsDatabase<typeof schema>;
export type TelemetrySqlClient = postgres.Sql;

export type TelemetryDbClient = {
  db: TelemetryDb;
  sql: TelemetrySqlClient;
  close: () => Promise<void>;
};

export const createTelemetryDbClient = (
  databaseUrl: string,
): TelemetryDbClient => {
  const sql = postgres(databaseUrl, { max: 10 });
  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
};
