import { randomUUID } from "node:crypto";
import {
  StudioContextResponseSchema,
  StudioTablePreferenceResponseSchema,
  type StudioTableView,
} from "@kortyx/telemetry-contracts";
import {
  createTelemetryDbClient,
  type TelemetryDb,
} from "@kortyx/telemetry-db";
import { organizations, projects, users } from "@kortyx/telemetry-db/schema";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../src/app";
import type { ApiHumanPrincipal } from "../src/auth/contracts";

const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("cloud table preference persistence", () => {
  it("saves personal views through the API and isolates users, projects, and organizations", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required.");
    const client = createTelemetryDbClient(databaseUrl);
    const org = randomUUID(),
      otherOrg = randomUUID(),
      project = randomUUID(),
      otherProject = randomUUID(),
      crossOrgProject = randomUUID();
    const alice = randomUUID(),
      bob = randomUUID();
    const viewId = randomUUID();
    const principal = (
      userId: string,
      organizationId = org,
      projectId = project,
    ): ApiHumanPrincipal => ({
      kind: "human",
      userId,
      organizationId,
      projectId,
      permissions: ["studio:read"],
    });
    const identities = new Map([
      ["alice", principal(alice)],
      ["bob", principal(bob)],
      ["alice-other-project", principal(alice, org, otherProject)],
      ["alice-other-org", principal(alice, otherOrg, crossOrgProject)],
    ]);
    const app = createApiApp({
      db: client.db,
      apiKeyPepper: "fixture-only",
      deployment: "cloud",
      authentication: {
        authenticate: async (request) => {
          const identity = identities.get(
            request.headers.get("authorization")?.replace("Bearer ", "") ?? "",
          );
          if (!identity) throw new Error("Unknown test identity.");
          return identity;
        },
      },
      // Read-only members may personalize their own tables without project writes.
      authorization: {
        allows: async (_principal, action) => action === "studio:read",
      },
      tenantDatabase: {
        withPrincipal: async (_principal, work) =>
          client.db.transaction((tx) => work(tx as unknown as TelemetryDb)),
      },
    });
    const get = async (identity: string) => {
      const response = await app.request(
        "/v1/studio/table-preferences/prompts",
        { headers: { authorization: `Bearer ${identity}` } },
      );
      expect(response.status).toBe(200);
      return StudioTablePreferenceResponseSchema.parse(await response.json());
    };
    const save = async (
      identity: string,
      scopeKey: string,
      expectedRevision: number,
      view: StudioTableView,
    ) =>
      app.request("/v1/studio/table-preferences/prompts", {
        method: "POST",
        headers: {
          authorization: `Bearer ${identity}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          scopeKey,
          expectedRevision,
          operation: { kind: "putView", view },
        }),
      });
    try {
      await client.db.insert(organizations).values([
        { id: org, name: "preferences-cloud" },
        { id: otherOrg, name: "preferences-other-org" },
      ]);
      await client.db.insert(projects).values([
        { id: project, organizationId: org, name: "one" },
        { id: otherProject, organizationId: org, name: "two" },
        { id: crossOrgProject, organizationId: otherOrg, name: "one" },
      ]);
      await client.db.insert(users).values([
        { id: alice, email: `${alice}@example.test` },
        { id: bob, email: `${bob}@example.test` },
      ]);
      const initial = await get("alice");
      expect(initial.scope.ownerKind).toBe("user");
      const context = await app.request("/v1/studio/context", {
        headers: { authorization: "Bearer alice" },
      });
      expect(context.status).toBe(200);
      expect(
        StudioContextResponseSchema.parse(await context.json())
          .tablePreferenceScope,
      ).toEqual(initial.scope);
      const view: StudioTableView = {
        id: viewId,
        name: "Alice view",
        filters: { match: "all", rules: [] },
        layout: { widths: {}, order: [], hidden: [], pinned: {} },
        scope: { q: "private-search" },
      };
      expect(
        (await save("alice", initial.scope.cacheKey, 0, view)).status,
      ).toBe(200);
      expect((await get("alice")).preferences.views).toEqual([view]);
      for (const identity of [
        "bob",
        "alice-other-project",
        "alice-other-org",
      ]) {
        const isolated = await get(identity);
        expect(isolated.preferences.views).toEqual([]);
        expect(isolated.scope.cacheKey).not.toBe(initial.scope.cacheKey);
      }
      const bobScope = (await get("bob")).scope.cacheKey;
      expect(
        (
          await save("bob", initial.scope.cacheKey, 0, {
            ...view,
            name: "Wrong scope",
          })
        ).status,
      ).toBe(403);
      // A stable imported view ID belongs to its parent profile, not globally.
      expect(
        (
          await save("bob", bobScope, 0, {
            ...view,
            name: "Bob view",
            scope: {},
          })
        ).status,
      ).toBe(200);
      expect((await get("alice")).preferences.views[0]?.name).toBe(
        "Alice view",
      );
      expect((await get("bob")).preferences.views[0]?.name).toBe("Bob view");
      expect(
        (
          await save("alice", initial.scope.cacheKey, 0, {
            ...view,
            name: "Stale",
          })
        ).status,
      ).toBe(409);
      expect((await get("alice")).preferences.views[0]?.name).toBe(
        "Alice view",
      );
    } finally {
      await client.sql`delete from organizations where id in (${org}::uuid, ${otherOrg}::uuid)`;
      await client.sql`delete from users where id in (${alice}::uuid, ${bob}::uuid)`;
      await client.close();
    }
  });
});
