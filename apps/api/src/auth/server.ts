import type { CreateApiAuth } from "@api/auth-contracts";
import {
  authenticateTelemetryApiKey,
  TelemetryAuthError,
  TelemetryForbiddenError,
} from "@kortyx/telemetry-db";

export const createApiAuth: CreateApiAuth = (options) => {
  if (options.deployment !== "self-hosted") {
    throw new Error("Cloud API requires an authentication adapter.");
  }
  return {
    async authenticate(request, surface) {
      const token = /^Bearer ([^\s]+)$/i.exec(
        request.headers.get("authorization") ?? "",
      )?.[1];
      if (!token)
        throw new TelemetryAuthError("Missing Authorization bearer token.");
      const identity = await authenticateTelemetryApiKey(options.db, {
        apiKey: token,
        pepper: options.apiKeyPepper,
      });
      const projectId = request.headers.get("x-kortyx-project-id");
      if (projectId && projectId !== identity.projectId)
        throw new TelemetryForbiddenError(
          "Selected project does not match the authorized scope.",
        );
      const environment =
        surface === "studio"
          ? request.headers.get("x-kortyx-environment")
          : null;
      if (
        environment &&
        identity.environment &&
        environment !== identity.environment
      )
        throw new TelemetryAuthError("Environment mismatch.");
      return {
        ...identity,
        kind: "api-key",
        ...(environment && !identity.environment ? { environment } : {}),
      };
    },
  };
};
