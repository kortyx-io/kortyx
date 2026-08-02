import {
  TelemetryAuthError,
  TelemetryForbiddenError,
} from "@kortyx/telemetry-db";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ApiEnv } from "./types";

export const apiErrorHandler: ErrorHandler<ApiEnv> = (error, c) => {
  const requestId = c.get("requestId");

  if (error instanceof TelemetryAuthError) {
    return c.json(
      { error: "UNAUTHORIZED", message: error.message, requestId },
      401,
    );
  }

  if (error instanceof TelemetryForbiddenError) {
    return c.json(
      { error: "FORBIDDEN", message: error.message, requestId },
      403,
    );
  }

  if (error instanceof HTTPException) {
    return c.json(
      {
        error: "HTTP_ERROR",
        message: error.message,
        requestId,
      },
      error.status,
    );
  }

  console.error(error);
  return c.json(
    {
      error: "INTERNAL_SERVER_ERROR",
      message: "Internal server error.",
      requestId,
    },
    500,
  );
};
