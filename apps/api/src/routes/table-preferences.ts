import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  StudioTableIdSchema,
  StudioTablePreferenceWriteSchema,
} from "@kortyx/telemetry-contracts";
import {
  readTablePreferences,
  TablePreferenceConflict,
  writeTablePreferences,
} from "@kortyx/telemetry-db";
import { bodyLimit } from "hono/body-limit";
import type { ApiDeployment } from "../auth/contracts";
import { canApiAction } from "../middleware/security";
import {
  tablePreferenceOwner,
  tablePreferenceScope,
} from "../preferences/owner";
import type { ApiEnv } from "../types";
export function registerTablePreferenceRoutes(
  app: OpenAPIHono<ApiEnv>,
  deployment: ApiDeployment,
) {
  const path = "/v1/studio/table-preferences/:tableId";
  app.use(path, bodyLimit({ maxSize: 131072 }));
  app.get(path, async (c) => {
    const tableId = StudioTableIdSchema.parse(c.req.param("tableId"));
    const owner = tablePreferenceOwner(c.get("principal"), deployment);
    c.header("cache-control", "no-store");
    return c.json({
      scope: tablePreferenceScope(c.get("principal"), deployment),
      preferences: await c.get("withTenantDatabase")((db) =>
        readTablePreferences(db, owner, tableId),
      ),
    });
  });
  app.post(path, async (c) => {
    const tableId = StudioTableIdSchema.parse(c.req.param("tableId"));
    const owner = tablePreferenceOwner(c.get("principal"), deployment);
    // Personalization does not grant mutation access to execution data.
    // Shared operator settings do require the existing project write permission.
    if (
      owner.ownerKind === "project" &&
      !(await canApiAction(c, "studio:write"))
    )
      return c.json(
        {
          error: "PREFERENCE_READ_ONLY",
          message:
            "Shared project preferences require studio:write permission.",
        },
        403,
      );
    const input = StudioTablePreferenceWriteSchema.parse(
      await c.req.json().catch(() => null),
    );
    const scope = tablePreferenceScope(c.get("principal"), deployment);
    if (input.scopeKey !== scope?.cacheKey)
      return c.json(
        {
          error: "PREFERENCE_SCOPE_CHANGED",
          message: "Your account or project changed. Reload this page.",
        },
        403,
      );
    c.header("cache-control", "no-store");
    try {
      return c.json({
        scope,
        preferences: await c.get("withTenantDatabase")((db) =>
          writeTablePreferences(db, owner, tableId, input),
        ),
      });
    } catch (error) {
      if (error instanceof TablePreferenceConflict)
        return c.json(
          {
            error: "PREFERENCE_CONFLICT",
            message:
              "Preferences changed elsewhere. Review before saving again.",
          },
          409,
        );
      throw error;
    }
  });
}
