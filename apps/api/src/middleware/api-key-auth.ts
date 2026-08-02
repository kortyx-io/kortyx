import { authenticateTelemetryApiKey } from "@kortyx/telemetry-db";
import type { MiddlewareHandler } from "hono";
import type { ApiEnv } from "../types";

export const apiKeyAuth = (args: {
  pepper: string;
  requiredScope: string;
}): MiddlewareHandler<ApiEnv> => {
  return async (c, next) => {
    const authorization = c.req.header("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined;

    if (!token) {
      return c.json(
        {
          error: "UNAUTHORIZED",
          message: "Missing Authorization bearer token.",
          requestId: c.get("requestId"),
        },
        401,
      );
    }

    const auth = await authenticateTelemetryApiKey(c.get("db"), {
      apiKey: token,
      pepper: args.pepper,
      requiredScope: args.requiredScope,
    });
    c.set("auth", auth);

    return next();
  };
};
