import type postgres from "postgres";

/** Bound lock acquisition without overriding a stricter deployment policy. */
export async function configurePostgresLockTimeout(
  sql: postgres.TransactionSql,
) {
  await sql`SELECT set_config('lock_timeout', CASE WHEN current_setting('lock_timeout')::interval = interval '0' OR current_setting('lock_timeout')::interval > interval '5 seconds' THEN '5s' ELSE current_setting('lock_timeout') END, true)`;
}
