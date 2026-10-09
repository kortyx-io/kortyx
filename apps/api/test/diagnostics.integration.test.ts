import { createHash, randomUUID } from "node:crypto";
import {
  DIAGNOSTIC_LIMITS,
  DiagnosticContentSchema,
  type DiagnosticManifest,
  DiagnosticResponseSchema,
} from "@kortyx/telemetry-contracts";
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

const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)(
  "private diagnostic ingestion and retrieval",
  () => {
    let client: TelemetryDbClient;
    let api: ReturnType<typeof createApiApp>;
    const tenants = [0, 1].map(() => ({
      organizationId: randomUUID(),
      projectId: randomUUID(),
    }));
    const first = tenants[0]!;
    beforeAll(async () => {
      client = createTelemetryDbClient(databaseUrl!);
      for (const tenant of tenants) {
        await client.db
          .insert(organizations)
          .values({ id: tenant.organizationId, name: "diagnostic-test" });
        await client.db.insert(projects).values({
          id: tenant.projectId,
          organizationId: tenant.organizationId,
          name: "diagnostic-test",
        });
        await client.db
          .insert(projectEnvironments)
          .values({ ...tenant, name: "test" });
      }
      api = createApiApp({
        db: client.db,
        apiKeyPepper: "test",
        authentication: {
          authenticate: async (request) => {
            const key = request.headers.get("authorization") ?? "";
            return {
              kind: "api-key",
              mode: "test",
              keyId: key,
              ...tenants[key === "other" ? 1 : 0]!,
              environment: "test",
              scopes:
                key === "writer"
                  ? ["telemetry:write"]
                  : key === "summary"
                    ? ["studio:read"]
                    : ["studio:read", "diagnostics:read"],
            };
          },
        },
      });
    });
    afterAll(async () => {
      if (!client) return;
      for (const tenant of tenants)
        await client.sql`delete from organizations where id = ${tenant.organizationId}::uuid`;
      await client.close();
    });
    const post = (path: string, value: unknown, key = "writer") =>
      api.request(`/v1/telemetry/diagnostics${path}`, {
        method: "POST",
        headers: { authorization: key, "content-type": "application/json" },
        body: JSON.stringify(value),
      });
    const get = (id: string, key = "reader", env = "test", extra = "") =>
      api.request(`/v1/studio/diagnostics/${id}?env=${env}${extra}`, {
        headers: { authorization: key },
      });
    const fixture = (
      data = {
        message: "provider rejected",
        responseBody: "ü".repeat(60 * 1024),
        custom: { retained: true },
      },
    ) => {
      const content = DiagnosticContentSchema.parse({
        schemaVersion: 1,
        data,
        capture: { status: "complete", omissions: [], redactions: [] },
      });
      const bytes = Buffer.from(JSON.stringify(content));
      const manifest: DiagnosticManifest = {
        schemaVersion: 1,
        diagnosticId: randomUUID(),
        occurrenceId: randomUUID(),
        occurredAt: new Date().toISOString(),
        environment: "test",
        service: { name: "test" },
        correlation: {
          runId: "run",
          workflowId: "workflow",
          nodeId: "brief",
          traceId: "trace",
          spanId: "span",
        },
        handled: false,
        mechanism: "span",
        severity: "error",
        summary: { type: "Error", message: "provider rejected" },
        captureStatus: "complete",
        checksum: createHash("sha256").update(bytes).digest("hex"),
        byteLength: bytes.length,
        partCount: Math.ceil(bytes.length / DIAGNOSTIC_LIMITS.partBytes),
      };
      const parts = Array.from({ length: manifest.partCount }, (_, index) => ({
        index,
        data: bytes
          .subarray(
            index * DIAGNOSTIC_LIMITS.partBytes,
            (index + 1) * DIAGNOSTIC_LIMITS.partBytes,
          )
          .toString("base64"),
      }));
      return { manifest, parts, content };
    };
    it("reconstructs reordered and duplicate parts, audits retrieval, and isolates tenant and environment", async () => {
      const { manifest, parts, content } = fixture();
      const id = manifest.diagnosticId;
      expect((await post("", manifest)).status).toBe(200);
      expect((await post(`/${id}/complete?env=test`, {})).status).toBe(200);
      expect(await (await get(id)).json()).toMatchObject({
        state: "incomplete",
        receivedParts: 0,
        content: null,
      });
      for (const part of [...parts].reverse()) {
        expect((await post(`/${id}/parts?env=test`, part)).status).toBe(200);
        expect((await post(`/${id}/parts?env=test`, part)).status).toBe(200);
      }
      expect(await (await post(`/${id}/complete?env=test`, {})).json()).toEqual(
        { state: "available" },
      );
      expect((await post("", manifest)).status).toBe(200);
      const result = DiagnosticResponseSchema.parse(
        await (await get(id, "reader", "test", "&download=1")).json(),
      );
      expect(result).toMatchObject({
        state: "available",
        content,
        manifest: { correlation: manifest.correlation },
      });
      expect(
        createHash("sha256")
          .update(JSON.stringify(result.content))
          .digest("hex"),
      ).toBe(result.contentChecksum);
      expect((await get(id, "summary")).status).toBe(403);
      expect((await get(id, "writer")).status).toBe(403);
      expect((await get(id, "other")).status).toBe(404);
      expect((await get(id, "reader", "production")).status).toBe(403);
      const audit =
        await client.sql`select action from diagnostic_access where organization_id = ${first.organizationId}::uuid and diagnostic_id = ${id}::uuid`;
      expect(audit.map((row) => row.action)).toContain("download");
      expect(
        await client.sql`select * from error_diagnostic_parts where organization_id = ${first.organizationId}::uuid`,
      ).toHaveLength(0);
    });
    it("refuses conflicts, checksum corruption and unbounded parts without serving incomplete bytes", async () => {
      const { manifest, parts } = fixture();
      const id = manifest.diagnosticId;
      expect((await post("", manifest)).status).toBe(200);
      expect((await post("", { ...manifest, handled: true })).status).toBe(400);
      const part = parts[0]!;
      expect((await post(`/${id}/parts?env=test`, part)).status).toBe(200);
      const corrupted = Buffer.from(part.data, "base64");
      corrupted[0] = 33;
      expect(
        (
          await post(`/${id}/parts?env=test`, {
            ...part,
            data: corrupted.toString("base64"),
          })
        ).status,
      ).toBe(400);
      expect(
        (await post(`/${id}/parts?env=test`, { index: 127, data: part.data }))
          .status,
      ).toBe(400);
      expect(
        (
          await post(`/${id}/parts?env=test`, {
            index: 0,
            data: "X".repeat(100001),
          })
        ).status,
      ).toBe(413);
      const bad = { ...fixture().manifest, checksum: "0".repeat(64) };
      await post("", bad);
      for (const part of parts)
        await post(`/${bad.diagnosticId}/parts?env=test`, part);
      expect(
        await (await post(`/${bad.diagnosticId}/complete?env=test`, {})).json(),
      ).toEqual({ state: "incomplete" });
      expect(await (await get(bad.diagnosticId)).json()).toMatchObject({
        state: "incomplete",
        content: null,
      });
    });
    it("applies mandatory server redaction to direct clients and expires private content", async () => {
      const { manifest, parts } = fixture({
        message: "provider rejected",
        responseBody: '{"token":"never-serve"}',
        custom: { retained: true, authorization: "private" },
        list: Array.from({ length: 1100 }, (_, index) => index),
      } as never);
      const id = manifest.diagnosticId;
      await post("", manifest);
      for (const part of parts) await post(`/${id}/parts?env=test`, part);
      await post(`/${id}/complete?env=test`, {});
      const response = await get(id);
      const content = (await response.json()) as {
        content: {
          data: { custom: { retained: boolean }; list: unknown[] };
          capture: { status: string; omissions: unknown[] };
        };
      };
      expect(JSON.stringify(content)).not.toContain("never-serve");
      expect(content.content.data.custom.retained).toBe(true);
      expect(content.content.data.list).toHaveLength(1000);
      expect(content.content.capture.status).toBe("partial");
      expect(content.content.capture.omissions).toContainEqual({
        path: "#/data/list",
        reason: "server_collection_limit",
        originalCount: 1100,
      });
      const stored =
        await client.sql`select content from error_diagnostics where diagnostic_id = ${id}::uuid`;
      expect(stored[0]?.content).not.toContain("never-serve");
      await client.sql`update error_diagnostics set expires_at = now() - interval '1 second' where diagnostic_id = ${id}::uuid`;
      expect(await (await get(id)).json()).toMatchObject({
        state: "expired",
        content: null,
      });
      expect(
        (
          await client.sql`select content from error_diagnostics where diagnostic_id = ${id}::uuid`
        )[0]?.content,
      ).toBeNull();
    });
  },
);
