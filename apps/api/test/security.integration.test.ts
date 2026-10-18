import { randomUUID } from "node:crypto";
import {
  createTelemetryDbClient,
  type TelemetryDbClient,
} from "@kortyx/telemetry-db";
import {
  organizations,
  projectEnvironments,
  projects,
} from "@kortyx/telemetry-db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiApp } from "../src/app";
import type { ApiPrincipal } from "../src/auth/contracts";
import type { ApiTenantDatabaseAdapter } from "../src/database/contracts";

const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("native Drizzle API database boundary", () => {
  let client: TelemetryDbClient;
  const tenants = ["a", "b"].map((name) => ({
    name,
    organizationId: randomUUID(),
    projectId: randomUUID(),
  }));
  beforeAll(async () => {
    client = createTelemetryDbClient(databaseUrl as string);
    for (const tenant of tenants) {
      await client.db.insert(organizations).values({
        id: tenant.organizationId,
        name: `API extension ${tenant.name}`,
      });
      await client.db.insert(projects).values({
        id: tenant.projectId,
        organizationId: tenant.organizationId,
        name: `Project ${tenant.name}`,
      });
      await client.db
        .insert(projectEnvironments)
        .values({ ...tenant, name: "test" });
    }
  });
  afterAll(async () => {
    if (!client) return;
    for (const tenant of tenants)
      await client.sql`delete from public.organizations where id = ${tenant.organizationId}::uuid`;
    await client.close();
  });

  const app = (database?: ApiTenantDatabaseAdapter) =>
    createApiApp({
      db: client.db,
      apiKeyPepper: "test",
      deployment: "cloud",
      authentication: {
        authenticate: async (request): Promise<ApiPrincipal> => {
          const tenant =
            tenants[
              request.headers.get("authorization") === "Bearer b" ? 1 : 0
            ];
          if (!tenant) throw new Error("Missing test tenant.");
          return {
            kind: "human",
            userId: "same-global-user",
            organizationId: tenant.organizationId,
            projectId: tenant.projectId,
            permissions: ["read"],
          };
        },
      },
      authorization: {
        allows: async (_principal, action) => action === "studio:read",
      },
      // This tests the native transaction bridge, not RLS. Cloud still needs its real
      // restricted role, SET LOCAL context and policies across all reachable tables.
      tenantDatabase: database ?? {
        withPrincipal: (_principal, work) =>
          client.db.transaction(async (tx) => work(tx)),
      },
    });

  it("reads different organizations through native transaction handles for one global user", async () => {
    const api = app();
    const responses = await Promise.all(
      ["a", "b"].map(async (name) => {
        const response = await api.request("/v1/studio/context", {
          headers: {
            authorization: `Bearer ${name}`,
            "x-organization-id": "attacker",
          },
        });
        expect(response.status).toBe(200);
        return response.json();
      }),
    );
    expect(responses).toMatchObject([
      {
        organization: { name: "API extension a" },
        project: { name: "Project a" },
        apiKey: null,
      },
      {
        organization: { name: "API extension b" },
        project: { name: "Project b" },
        apiKey: null,
      },
    ]);
  });

  it("rolls back database work before Hono turns an operation failure into a response", async () => {
    const first = tenants[0];
    if (!first) throw new Error("Missing tenant fixture.");
    const api = app({
      withPrincipal: (_principal, work) =>
        client.db.transaction(async (tx) => {
          // Repository transactions are native savepoints inside the adapter's transaction.
          await tx.transaction(async (nested) => {
            const current = await nested.query.projects.findFirst({
              columns: { id: true },
            });
            expect(current).toBeDefined();
          });
          await tx.insert(projectEnvironments).values({
            organizationId: first.organizationId,
            projectId: first.projectId,
            name: "must-rollback",
          });
          await work(tx);
          throw new Error("Deliberate operation failure.");
        }),
    });
    expect((await api.request("/v1/studio/context")).status).toBe(500);
    const rows =
      await client.sql`select name from public.project_environments where organization_id = ${first.organizationId}::uuid and name = 'must-rollback'`;
    expect(rows).toHaveLength(0);
    expect((await app().request("/v1/studio/context")).status).toBe(200);
  });
});
