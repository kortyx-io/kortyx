import { createHash } from "node:crypto";
import type postgres from "postgres";

/** Only Studio-owned relations; unrelated applications may share the database. */
export const LEGACY_TABLES = [
  "api_keys",
  "auth_accounts",
  "eval_run_events",
  "eval_runs",
  "model_rate_cards",
  "organization_invitations",
  "organization_memberships",
  "organizations",
  "project_environments",
  "projects",
  "studio_interrupts",
  "studio_runs",
  "studio_sessions",
  "telemetry_events",
  "telemetry_scores",
  "users",
  "workflow_revisions",
];

/** Catalog-only compatibility check: never introspect customer data or alter DDL. */
export async function legacySchemaFingerprint(
  sql: postgres.Sql,
): Promise<string> {
  const rows = await sql`
    SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
      (SELECT jsonb_agg(jsonb_build_object(
        'name', a.attname, 'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
        'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
      ) ORDER BY a.attnum)
       FROM pg_catalog.pg_attribute a
       LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns,
      (SELECT jsonb_agg(jsonb_build_object('name', x.conname,
        'definition', pg_catalog.pg_get_constraintdef(x.oid)) ORDER BY x.conname)
       FROM pg_catalog.pg_constraint x WHERE x.conrelid = c.oid
         AND x.contype IN ('p', 'u', 'f', 'c', 'e')) AS constraints,
      (SELECT jsonb_agg(pg_catalog.pg_get_indexdef(i.indexrelid) ORDER BY ic.relname)
       FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
       WHERE i.indrelid = c.oid) AS indexes,
      (SELECT jsonb_agg(pg_catalog.pg_get_triggerdef(t.oid) ORDER BY t.tgname)
       FROM pg_catalog.pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal) AS triggers
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname = ANY(${LEGACY_TABLES})
    ORDER BY c.relname
  `;
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
