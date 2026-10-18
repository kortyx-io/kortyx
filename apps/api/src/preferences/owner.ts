import { createHash } from "node:crypto";
import {
  type TablePreferenceOwner,
  TelemetryForbiddenError,
} from "@kortyx/telemetry-db";
import type { ApiDeployment, ApiPrincipal } from "../auth/contracts";
export function tablePreferenceOwner(
  principal: ApiPrincipal,
  deployment: ApiDeployment,
): TablePreferenceOwner {
  if (principal.kind === "human")
    return {
      organizationId: principal.organizationId,
      projectId: principal.projectId,
      ownerKind: "user",
      userId: principal.userId,
    };
  if (deployment !== "self-hosted")
    throw new TelemetryForbiddenError(
      "Personal preferences require an authenticated user.",
    );
  return {
    organizationId: principal.organizationId,
    projectId: principal.projectId,
    ownerKind: "project",
    userId: null,
  };
}
export function tablePreferenceScope(
  principal: ApiPrincipal,
  deployment: ApiDeployment,
) {
  if (deployment === "cloud" && principal.kind !== "human") return null;
  const owner = tablePreferenceOwner(principal, deployment);
  return {
    ownerKind: owner.ownerKind,
    cacheKey: createHash("sha256").update(JSON.stringify(owner)).digest("hex"),
  };
}
