import type { MigrationMeta } from "drizzle-orm/migrator";

/** Released SQL is immutable. Timestamps are fixed ordering keys, not release dates. */
export const LEGACY_MIGRATIONS = [
  {
    tag: "0000_initial_telemetry",
    when: 1700000000000,
    hash: "a9314a07d2b44cdabd1b12367ef15d3be37d332ba0df3a7da21273ff4b044029",
  },
  {
    tag: "0001_workflow_transitions",
    when: 1700000000001,
    hash: "22ec88576072ad0a6b865a8f35a4a4d5c32ccbb3c793716c0038cd6122652861",
  },
  {
    tag: "0002_studio_projections",
    when: 1700000000002,
    hash: "b068457cb14f8d6c5bec1a2c7ccb737a6d7998a021e35e29ef23f395100f9b2a",
  },
  {
    tag: "0003_interrupt_expiry_index",
    when: 1700000000003,
    hash: "1322f82cb7596874479a39e8421ea43a848a1d4f5c35e97559825a15ac3b2f5e",
  },
  {
    tag: "0004_telemetry_scores",
    when: 1700000000004,
    hash: "5e67397d46effb3e1836e3013735b82def7bc1683fcdafea9406fd8fb932004c",
  },
  {
    tag: "0005_eval_runs",
    when: 1700000000005,
    hash: "b3d963beb92a94cfdc7c320bcf8bf3060db9714387c9a66a381230bf35e332c1",
  },
] as const;

/** Frozen one-time compatibility data; not used by native migration or CI. */
export function validateLegacyHistory(migrations: MigrationMeta[]): void {
  for (const [idx, legacy] of LEGACY_MIGRATIONS.entries()) {
    if (
      migrations[idx]?.folderMillis !== legacy.when ||
      migrations[idx]?.hash !== legacy.hash
    ) {
      throw new Error(
        `Released migration ${legacy.tag}.sql was changed or removed. Append a new migration instead.`,
      );
    }
  }
}

export function legacyPrefix(ids: string[]): number {
  const known = new Set<string>(
    LEGACY_MIGRATIONS.map(({ tag }) => `${tag}.sql`),
  );
  const applied = new Set(ids);
  if (ids.length !== applied.size || ids.some((id) => !known.has(id))) {
    throw new Error(
      "Unknown legacy migration history. Restore the matching release; do not reset the database.",
    );
  }
  for (const [idx, migration] of LEGACY_MIGRATIONS.entries()) {
    if (applied.has(`${migration.tag}.sql`) !== idx < applied.size) {
      throw new Error(
        "Legacy migration history has a gap. Refusing to guess a baseline.",
      );
    }
  }
  return applied.size;
}

/** Catalog fingerprints for exact legacy prefixes, including interrupted upgrades. */
export const LEGACY_SCHEMA_FINGERPRINTS = [
  "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "7f9a9f491d73fab5b5a7ce4e89eb30d5823ff0799add6503dbd4b89b98c08c56",
  "7f9a9f491d73fab5b5a7ce4e89eb30d5823ff0799add6503dbd4b89b98c08c56",
  "cadf426f886a511beb0e1cce36bba10e7593ecb41bab752688c93b9ebd672d28",
  "67508ea48b624597637f2670196e23c5f9b382055692c92e7c0f94c2da410ebc",
  "cd8a754001c351925dbdd70e412d76b113cb7f67e0d6433717cc41c798ad70a0",
  "4847e55f88b80309717e5c1d1c208c0d02f70c5c892c217aa81e7b29d84db190",
] as const;
