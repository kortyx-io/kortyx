import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareDatabaseForDrizzle } from "../src/scripts/legacy-drizzle-preparation";
import {
  LEGACY_MIGRATIONS,
  LEGACY_SCHEMA_FINGERPRINTS,
} from "../src/scripts/legacy-migrations";
import { migrateForDeployment } from "../src/scripts/migrate-for-deployment";
import {
  type JournalEntry,
  readHistory,
} from "../src/scripts/migration-history";
import { migrateDatabase } from "../src/scripts/migration-runner";
import { legacySchemaFingerprint } from "../src/scripts/migration-schema";

const productionDir = path.resolve(import.meta.dirname, "../drizzle");
let migrationsDir = productionDir;
const databaseUrl = process.env.DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

async function withDatabase(
  run: (sql: postgres.Sql, url: string) => Promise<void>,
) {
  // Tests need CREATEDB on a disposable PostgreSQL instance, never a customer DB.
  const admin = postgres(databaseUrl as string, {
    max: 1,
    onnotice: () => undefined,
  });
  const name = `kortyx_migration_test_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(databaseUrl as string);
  url.pathname = `/${name}`;
  let sql: postgres.Sql | undefined;
  let created = false;
  try {
    await admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    sql = postgres(url.toString(), { max: 1, onnotice: () => undefined });
    // Match released installations: pg_catalog is implicit and searched first.
    await sql`SET search_path TO public`;
    await run(sql, url.toString());
  } finally {
    await sql?.end({ timeout: 5 });
    if (created) await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }
}

const migrate = (url: string, folder = migrationsDir) =>
  migrateForDeployment({
    databaseUrl: url,
    migrationsDir: folder,
    log: () => undefined,
  });

const prepare = (url: string, folder = migrationsDir) =>
  prepareDatabaseForDrizzle({
    databaseUrl: url,
    migrationsDir: folder,
    log: () => undefined,
  });

const native = (url: string, folder = migrationsDir) =>
  migrateDatabase({
    databaseUrl: url,
    migrationsDir: folder,
    log: () => undefined,
  });

async function installLegacy(sql: postgres.Sql, count: number) {
  await sql`CREATE TABLE public.kortyx_schema_migrations (
    id text PRIMARY KEY, applied_at timestamptz DEFAULT now() NOT NULL
  )`;
  for (const { tag } of LEGACY_MIGRATIONS.slice(0, count)) {
    await sql.begin(async (tx) => {
      await tx.unsafe(
        await readFile(path.join(migrationsDir, `${tag}.sql`), "utf8"),
      );
      await tx`INSERT INTO public.kortyx_schema_migrations (id) VALUES (${`${tag}.sql`})`;
    });
  }
}

async function seed(sql: postgres.Sql, prefix: number) {
  if (!prefix) return;
  await sql`INSERT INTO organizations (id, name) VALUES ('10000000-0000-0000-0000-000000000001', 'existing customer')`;
  await sql`INSERT INTO projects (id, organization_id, name)
    VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'existing app')`;
  await sql`INSERT INTO users (email, name) VALUES ('existing@example.test', 'existing user')`;
  await sql`INSERT INTO api_keys (id, organization_id, project_id, mode, name, secret_hash, scopes)
    VALUES ('existing-key-id', '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 'live', 'existing key', 'unchanged-secret-verifier', '["events:write"]')`;
  await sql`INSERT INTO telemetry_events (
    organization_id, project_id, event_id, schema_version, type, occurred_at,
    environment, service_name, run_id, workflow_id, payload)
    VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
      'existing-event', 1, 'run.started', now(), 'production', 'existing-app', 'existing-run', 'existing-workflow', '{"preserve":true}')`;
  if (prefix >= 3) {
    await sql`INSERT INTO studio_runs (
      organization_id, project_id, run_id, status, started_at, environment, data)
      VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
        'existing-run', 'completed', now(), 'production', '{"existing":"projection"}')`;
  }
  if (prefix >= 5) {
    await sql`INSERT INTO telemetry_scores (
      organization_id, project_id, run_id, environment, name, data_type, value, source, actor_id)
      VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
        'existing-run', 'production', 'quality', 'NUMERIC', '0.8', 'human-review', 'existing-user')`;
  }
  if (prefix >= 6) {
    await sql`INSERT INTO eval_runs (organization_id, project_id, target_id, target_name,
      suite_id, suite_revision, suite, request, requested_by, environment)
      VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
        'existing-target', 'existing eval', 'existing-suite', 'v1', '{}', '{}', 'existing-user', 'production')`;
  }
}

async function customerRows(sql: postgres.Sql, prefix: number) {
  if (!prefix) return [];
  const tables = [
    "organizations",
    "projects",
    "users",
    "api_keys",
    "telemetry_events",
  ];
  if (prefix >= 3) tables.push("studio_runs");
  if (prefix >= 5) tables.push("telemetry_scores");
  if (prefix >= 6) tables.push("eval_runs");
  return Promise.all(
    tables.map(async (table) => ({
      table,
      // OIDs prove adoption did not drop/recreate already-deployed tables.
      oid: (await sql`SELECT to_regclass(${`public.${table}`})::oid AS oid`)[0]
        ?.oid,
      rows: [...(await sql.unsafe(`SELECT * FROM "${table}" ORDER BY id`))],
    })),
  );
}

async function withFutureMigrations(
  run: (
    folder: string,
    append: (source: string) => Promise<string>,
  ) => Promise<void>,
) {
  const folder = await mkdtemp(path.join(tmpdir(), "kortyx-drizzle-test-"));
  try {
    await cp(migrationsDir, folder, { recursive: true });
    const journal = JSON.parse(
      await readFile(path.join(folder, "meta/_journal.json"), "utf8"),
    ) as { entries: JournalEntry[] };
    const append = async (source: string) => {
      const idx = journal.entries.length;
      const tag = `${String(idx).padStart(4, "0")}_test`;
      journal.entries.push({
        idx,
        version: "7",
        when: 1700000000000 + idx,
        tag,
        breakpoints: true,
      });
      await writeFile(path.join(folder, `${tag}.sql`), source);
      await writeFile(
        path.join(folder, "meta/_journal.json"),
        JSON.stringify(journal),
      );
      return path.join(folder, `${tag}.sql`);
    };
    await run(folder, append);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

integration("native Drizzle migration cutover", () => {
  beforeAll(async () => {
    // Freeze the cutover at the six released SQL files. Future product migrations
    // must not change what these historical compatibility scenarios exercise.
    migrationsDir = await mkdtemp(
      path.join(tmpdir(), "kortyx-cutover-fixture-"),
    );
    await mkdir(path.join(migrationsDir, "meta"));
    for (const { tag } of LEGACY_MIGRATIONS) {
      await cp(
        path.join(productionDir, `${tag}.sql`),
        path.join(migrationsDir, `${tag}.sql`),
      );
    }
    await cp(
      path.join(productionDir, "meta/0005_snapshot.json"),
      path.join(migrationsDir, "meta/0005_snapshot.json"),
    );
    await writeFile(
      path.join(migrationsDir, "meta/_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: LEGACY_MIGRATIONS.map(({ tag, when }, idx) => ({
          idx,
          version: "7",
          when,
          tag,
          breakpoints: false,
        })),
      }),
    );
  });

  afterAll(async () => {
    if (migrationsDir !== productionDir)
      await rm(migrationsDir, { recursive: true, force: true });
  });

  it("matches snapshot column, foreign-key, check and index names to the deployed catalog", async () => {
    const history = await readHistory(productionDir);
    const latest = history.entries.at(-1);
    if (!latest) throw new Error("Missing native history.");
    const snapshot = JSON.parse(
      await readFile(
        path.join(
          productionDir,
          `meta/${String(latest.idx).padStart(4, "0")}_snapshot.json`,
        ),
        "utf8",
      ),
    ) as {
      tables: Record<
        string,
        {
          name: string;
          columns: Record<string, unknown>;
          foreignKeys: Record<string, unknown>;
          checkConstraints: Record<string, unknown>;
          indexes: Record<string, unknown>;
        }
      >;
    };
    await withDatabase(async (sql, url) => {
      await migrate(url, productionDir);
      for (const table of Object.values(snapshot.tables)) {
        const [catalog] = await sql`
          SELECT
            (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute
              WHERE attrelid = to_regclass(${table.name}) AND attnum > 0 AND NOT attisdropped) AS columns,
            (SELECT array_agg(conname::text ORDER BY conname) FROM pg_constraint
              WHERE conrelid = to_regclass(${table.name}) AND contype = 'f') AS fks,
            (SELECT array_agg(conname::text ORDER BY conname) FROM pg_constraint
              WHERE conrelid = to_regclass(${table.name}) AND contype = 'c') AS checks,
            (SELECT array_agg(c.relname::text ORDER BY c.relname) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
              WHERE i.indrelid = to_regclass(${table.name}) AND NOT i.indisprimary) AS indexes
        `;
        expect(catalog?.columns, table.name).toEqual(
          Object.keys(table.columns).sort(),
        );
        expect(catalog?.fks ?? [], table.name).toEqual(
          Object.keys(table.foreignKeys).sort(),
        );
        expect(catalog?.checks ?? [], table.name).toEqual(
          Object.keys(table.checkConstraints).sort(),
        );
        expect(catalog?.indexes ?? [], table.name).toEqual(
          Object.keys(table.indexes).sort(),
        );
      }
    });
  });

  it.each([
    0, 1, 2, 3, 4, 5, 6,
  ])("upgrades legacy prefix %i without changing customer rows", async (prefix) => {
    await withDatabase(async (sql, url) => {
      await installLegacy(sql, prefix);
      await seed(sql, prefix);
      expect(await legacySchemaFingerprint(sql)).toBe(
        LEGACY_SCHEMA_FINGERPRINTS[prefix],
      );
      const before = await customerRows(sql, prefix);
      const oldLedger = [
        ...(await sql`SELECT * FROM public.kortyx_schema_migrations ORDER BY id`),
      ];
      await migrate(url);
      await migrate(url);
      expect(await customerRows(sql, prefix)).toEqual(before);
      expect(await legacySchemaFingerprint(sql)).toBe(
        LEGACY_SCHEMA_FINGERPRINTS[6],
      );
      const native =
        await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
      expect(
        native.map((row) => ({ hash: row.hash, when: Number(row.created_at) })),
      ).toEqual(LEGACY_MIGRATIONS.map(({ hash, when }) => ({ hash, when })));
      const ledger =
        await sql`SELECT * FROM public.kortyx_schema_migrations ORDER BY id`;
      expect([...ledger]).toEqual(oldLedger);
    });
  }, 30000);

  it("installs a fresh database with no legacy ledger", async () => {
    await withDatabase(async (sql, url) => {
      await migrate(url);
      expect(await legacySchemaFingerprint(sql)).toBe(
        LEGACY_SCHEMA_FINGERPRINTS[6],
      );
      expect(
        (
          await sql`SELECT to_regclass('public.kortyx_schema_migrations') AS relation`
        )[0]?.relation,
      ).toBeNull();
    });
  });

  it("serializes concurrent runners, including a pending native migration", async () => {
    await withFutureMigrations(async (folder, append) => {
      await append(
        "CREATE TABLE migration_once (id integer PRIMARY KEY);--> statement-breakpoint\nSELECT pg_sleep(0.2);",
      );
      await withDatabase(async (sql, url) => {
        await Promise.all([migrate(url, folder), migrate(url, folder)]);
        expect(
          (
            await sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
          )[0]?.count,
        ).toBe(7);
        expect(
          (await sql`SELECT to_regclass('migration_once') AS relation`)[0]
            ?.relation,
        ).toBe("migration_once");
      });
    });
  });

  it("shares the advisory lock with the released runner", async () => {
    await withDatabase(async (sql, url) => {
      await installLegacy(sql, 6);
      await sql`SELECT pg_advisory_lock(hashtextextended('kortyx_schema_migrations', 0))`;
      const pending = migrate(url);
      try {
        // Query server lock state instead of relying only on a timing assertion.
        let waiting = false;
        for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
          waiting =
            (
              await sql`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted
                AND database = (SELECT oid FROM pg_database WHERE datname = current_database())) AS waiting`
            )[0]?.waiting === true;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
        expect(
          (
            await sql`SELECT to_regclass('drizzle.__drizzle_migrations') AS relation`
          )[0]?.relation,
        ).toBeNull();
      } finally {
        await sql`SELECT pg_advisory_unlock_all()`;
        await pending;
      }
    });
  });

  it("rolls back the whole pending batch and retries without a reset", async () => {
    await withFutureMigrations(async (folder, append) => {
      await append("CREATE TABLE pending_atomic (id integer);");
      const failedFile = await append(
        "SELECT * FROM deliberately_missing_relation;",
      );
      await withDatabase(async (sql, url) => {
        await installLegacy(sql, 4);
        await seed(sql, 4);
        const before = await customerRows(sql, 4);
        await expect(migrate(url, folder)).rejects.toThrow();
        expect(await customerRows(sql, 4)).toEqual(before);
        expect(
          (
            await sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
          )[0]?.count,
        ).toBe(4);
        expect(
          (
            await sql`SELECT to_regclass('pending_atomic') AS relation, to_regclass('telemetry_scores') AS scores`
          )[0],
        ).toEqual({ relation: null, scores: null });
        // Editing an UNAPPLIED migration in this test fixture is safe.
        await writeFile(failedFile, "SELECT 1;");
        await migrate(url, folder);
        expect(
          (
            await sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
          )[0]?.count,
        ).toBe(8);
        expect(await customerRows(sql, 4)).toEqual(before);
      });
    });
  });

  it("prepares an old database once, without applying product SQL or maintaining its old ledger", async () => {
    await withDatabase(async (sql, url) => {
      await installLegacy(sql, 4);
      await seed(sql, 4);
      const before = await customerRows(sql, 4);
      const ledger = [
        ...(await sql`SELECT * FROM public.kortyx_schema_migrations ORDER BY id`),
      ];
      expect(await prepare(url)).toBe("prepared");
      expect(await prepare(url)).toBe("native");
      expect(await legacySchemaFingerprint(sql)).toBe(
        LEGACY_SCHEMA_FINGERPRINTS[4],
      );
      expect(
        (
          await sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
        )[0]?.count,
      ).toBe(4);
      expect(
        (await sql`SELECT to_regclass('telemetry_scores') AS relation`)[0]
          ?.relation,
      ).toBeNull();
      expect(await customerRows(sql, 4)).toEqual(before);
      expect([
        ...(await sql`SELECT * FROM public.kortyx_schema_migrations ORDER BY id`),
      ]).toEqual(ledger);
      await native(url);
      await native(url);
      expect(await customerRows(sql, 4)).toEqual(before);
      expect(await legacySchemaFingerprint(sql)).toBe(
        LEGACY_SCHEMA_FINGERPRINTS[6],
      );
      expect([
        ...(await sql`SELECT * FROM public.kortyx_schema_migrations ORDER BY id`),
      ]).toEqual(ledger);
    });
  });

  it("preparation is a read-only no-op on a fresh database", async () => {
    await withDatabase(async (sql, url) => {
      expect(await prepare(url)).toBe("fresh");
      expect(await prepare(url)).toBe("fresh");
      expect(
        (
          await sql`SELECT to_regclass('drizzle.__drizzle_migrations') AS native,
        to_regclass('public.kortyx_schema_migrations') AS legacy`
        )[0],
      ).toEqual({ native: null, legacy: null });
      await native(url);
      expect(
        (
          await sql`SELECT to_regclass('public.kortyx_schema_migrations') AS legacy`
        )[0]?.legacy,
      ).toBeNull();
    });
  });

  it("the standalone CLI adopts an installation created with the released default search_path", async () => {
    await withDatabase(async (sql, url) => {
      await sql`SET search_path TO "$user", public`;
      await installLegacy(sql, 4);
      await seed(sql, 4);
      const before = await customerRows(sql, 4);
      const output = execFileSync(
        "pnpm",
        ["exec", "tsx", "src/scripts/prepare-drizzle.ts"],
        {
          cwd: path.dirname(productionDir),
          env: { ...process.env, DATABASE_URL: url },
          encoding: "utf8",
        },
      );
      expect(output).toContain("Drizzle preparation: prepared");
      expect(
        (
          await sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
        )[0]?.count,
      ).toBe(4);
      expect(
        (
          await sql`SELECT count(*)::int AS count FROM public.kortyx_schema_migrations`
        )[0]?.count,
      ).toBe(4);
      expect(
        (await sql`SELECT to_regclass('telemetry_scores') AS relation`)[0]
          ?.relation,
      ).toBeNull();
      expect(await customerRows(sql, 4)).toEqual(before);
    });
  }, 30000);

  it("already-native databases ignore stale legacy metadata and never recreate it", async () => {
    await withDatabase(async (sql, url) => {
      await installLegacy(sql, 4);
      await migrate(url);
      await seed(sql, 6);
      const before = await customerRows(sql, 6);
      // A malformed archive must not influence the native execution path.
      await sql`INSERT INTO public.kortyx_schema_migrations (id) VALUES ('9999_obsolete.sql')`;
      const ledger = [
        ...(await sql`SELECT * FROM public.kortyx_schema_migrations ORDER BY id`),
      ];
      expect(await prepare(url)).toBe("native");
      await native(url);
      await migrate(url);
      expect([
        ...(await sql`SELECT * FROM public.kortyx_schema_migrations ORDER BY id`),
      ]).toEqual(ledger);
      await sql`DROP TABLE public.kortyx_schema_migrations`;
      expect(await prepare(url)).toBe("native");
      await migrate(url);
      expect(
        (
          await sql`SELECT to_regclass('public.kortyx_schema_migrations') AS relation`
        )[0]?.relation,
      ).toBeNull();
      expect(await customerRows(sql, 6)).toEqual(before);
    });
  });

  it("does not guess a legacy baseline when using the native command directly", async () => {
    await withDatabase(async (sql, url) => {
      await installLegacy(sql, 4);
      await seed(sql, 4);
      const before = await customerRows(sql, 4);
      await expect(native(url)).rejects.toThrow();
      expect(await customerRows(sql, 4)).toEqual(before);
      expect(
        (
          await sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
        )[0]?.count,
      ).toBe(0);
      expect(await prepare(url)).toBe("prepared");
      await native(url);
      expect(await customerRows(sql, 4)).toEqual(before);
    });
  });

  it("serializes standalone preparation with automatic deployment adoption", async () => {
    await withDatabase(async (sql, url) => {
      await installLegacy(sql, 4);
      await Promise.all([
        prepare(url),
        migrate(url),
        prepare(url),
        migrate(url),
      ]);
      expect(
        (
          await sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
        )[0]?.count,
      ).toBe(6);
      expect(
        (
          await sql`SELECT count(*)::int AS count FROM public.kortyx_schema_migrations`
        )[0]?.count,
      ).toBe(4);
    });
  });

  it("native execution accepts ordinary Drizzle history without the legacy manifest", async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "kortyx-native-only-"));
    try {
      await mkdir(path.join(folder, "meta"));
      await writeFile(
        path.join(folder, "0000_native_only.sql"),
        "CREATE TABLE native_only (id integer PRIMARY KEY);",
      );
      await writeFile(
        path.join(folder, "meta/_journal.json"),
        JSON.stringify({
          version: "7",
          dialect: "postgresql",
          entries: [
            {
              idx: 0,
              version: "7",
              when: 1700000000000,
              tag: "0000_native_only",
              breakpoints: true,
            },
          ],
        }),
      );
      await withDatabase(async (sql, url) => {
        await native(url, folder);
        await native(url, folder);
        expect(
          (
            await sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
          )[0]?.count,
        ).toBe(1);
        expect(
          (
            await sql`SELECT to_regclass('native_only') AS relation,
          to_regclass('public.kortyx_schema_migrations') AS legacy`
          )[0],
        ).toEqual({ relation: "native_only", legacy: null });
      });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it.each([
    "gap",
    "unknown",
    "drift",
    "untracked",
  ] as const)("refuses %s legacy state before baseline writes", async (state) => {
    await withDatabase(async (sql, url) => {
      await installLegacy(sql, 4);
      await seed(sql, 4);
      if (state === "gap")
        await sql`DELETE FROM public.kortyx_schema_migrations WHERE id = '0001_workflow_transitions.sql'`;
      if (state === "unknown")
        await sql`INSERT INTO public.kortyx_schema_migrations (id) VALUES ('9999_unknown.sql')`;
      if (state === "drift")
        await sql`ALTER TABLE projects ADD COLUMN unexpected text`;
      if (state === "untracked")
        await sql`DROP TABLE public.kortyx_schema_migrations`;
      const before = await customerRows(sql, 4);
      await expect(migrate(url)).rejects.toThrow();
      expect(await customerRows(sql, 4)).toEqual(before);
      expect(
        (
          await sql`SELECT to_regclass('drizzle.__drizzle_migrations') AS relation`
        )[0]?.relation,
      ).toBeNull();
      expect(
        (await sql`SELECT to_regclass('telemetry_scores') AS relation`)[0]
          ?.relation,
      ).toBeNull();
    });
  });

  it("refuses changed, missing, or newer native history", async () => {
    await withFutureMigrations(async (folder, append) => {
      const file = await append("CREATE TABLE future_history (id integer);");
      await withDatabase(async (sql, url) => {
        await migrate(url, folder);
        await seed(sql, 6);
        const before = await customerRows(sql, 6);
        await writeFile(file, "CREATE TABLE future_history (id bigint);");
        await expect(migrate(url, folder)).rejects.toThrow("differs");
        await expect(migrate(url)).rejects.toThrow("differs"); // Older release.
        await writeFile(file, "CREATE TABLE future_history (id integer);");
        await sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1700000000001`;
        await expect(migrate(url, folder)).rejects.toThrow("differs");
        expect(await customerRows(sql, 6)).toEqual(before);
      });
    });
  });

  it("ignores unrelated application tables during legacy adoption", async () => {
    await withDatabase(async (sql, url) => {
      await installLegacy(sql, 4);
      await sql`CREATE TABLE unrelated_app (id integer PRIMARY KEY)`;
      await sql`INSERT INTO unrelated_app VALUES (42)`;
      await migrate(url);
      expect([...(await sql`SELECT * FROM unrelated_app`)]).toEqual([
        { id: 42 },
      ]);
    });
  });

  it("keeps the same schema under a non-default caller search_path", async () => {
    await withDatabase(async (sql, url) => {
      await sql`CREATE SCHEMA unrelated`;
      const connection = new URL(url);
      connection.searchParams.set("options", "-c search_path=unrelated,public");
      await migrate(connection.toString());
      expect(await legacySchemaFingerprint(sql)).toBe(
        LEGACY_SCHEMA_FINGERPRINTS[6],
      );
    });
  });
});

import { execFileSync } from "node:child_process";
