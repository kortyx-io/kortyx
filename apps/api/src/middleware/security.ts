import { createHash } from "node:crypto";
import {
  TelemetryAuthError,
  TelemetryForbiddenError,
} from "@kortyx/telemetry-db";
import type { Context, MiddlewareHandler } from "hono";
import type {
  ApiAuthAdapter,
  ApiPrincipal,
  ApiSurface,
} from "../auth/contracts";
import type {
  ApiAction,
  ApiAuthorizationAdapter,
} from "../authorization/contracts";
import type { ApiTenantDatabaseAdapter } from "../database/contracts";
import type { ApiEnv } from "../types";

const identityId = (principal: ApiPrincipal) =>
  principal.kind === "api-key" ? principal.keyId : principal.userId;

/** Prevent adapters from sharing mutable per-request identity/permission arrays. */
const snapshotPrincipal = (principal: ApiPrincipal): ApiPrincipal => {
  if (
    !principal.organizationId ||
    !principal.projectId ||
    !identityId(principal)
  ) {
    throw new TelemetryAuthError();
  }
  return principal.kind === "api-key"
    ? Object.freeze({
        ...principal,
        scopes: Object.freeze([...principal.scopes]),
      })
    : Object.freeze({
        ...principal,
        permissions: Object.freeze([...principal.permissions]),
      });
};

export const principalActorId = (principal: ApiPrincipal): string => {
  const id = createHash("sha256")
    .update(identityId(principal))
    .digest("hex")
    .slice(0, 24);
  return principal.kind === "api-key"
    ? `studio-key:${id}`
    : `studio-user:${id}`;
};

export const canApiAction = (
  c: Context<ApiEnv>,
  action: ApiAction,
): Promise<boolean> =>
  c
    .get("authorization")
    .allows(c.get("principal"), action)
    .then((allowed) => allowed === true);

export const requireApiAction = async (
  c: Context<ApiEnv>,
  action: ApiAction,
): Promise<void> => {
  if (!(await canApiAction(c, action))) {
    throw new TelemetryForbiddenError(
      `Operation requires ${action} permission.`,
    );
  }
};

export const apiSecurity =
  (options: {
    authentication: ApiAuthAdapter;
    authorization: ApiAuthorizationAdapter;
    tenantDatabase: ApiTenantDatabaseAdapter;
    surface: ApiSurface;
    action: ApiAction;
  }): MiddlewareHandler<ApiEnv> =>
  async (c, next) => {
    const principal = snapshotPrincipal(
      await options.authentication.authenticate(c.req.raw, options.surface),
    );
    // SDK ingestion is a machine-credential surface even if a human has broad permissions.
    if (options.surface === "telemetry" && principal.kind !== "api-key") {
      throw new TelemetryForbiddenError(
        "Telemetry ingestion requires an API key.",
      );
    }
    c.set("principal", principal);
    c.set("authorization", options.authorization);
    await requireApiAction(c, options.action);
    c.set("withTenantDatabase", (work) =>
      options.tenantDatabase.withPrincipal(principal, work),
    );
    c.set("revalidateStreamAccess", async () => {
      const fresh = snapshotPrincipal(
        await options.authentication.authenticate(c.req.raw, options.surface),
      );
      if (
        fresh.kind !== principal.kind ||
        identityId(fresh) !== identityId(principal) ||
        fresh.organizationId !== principal.organizationId ||
        fresh.projectId !== principal.projectId ||
        (await options.authorization.allows(fresh, options.action)) !== true
      ) {
        throw new TelemetryForbiddenError(
          "Stream access is no longer authorized.",
        );
      }
    });
    await next();
  };
