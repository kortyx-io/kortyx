import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  type StudioChange,
  type StudioChangeResource,
  StudioChangeResourceSchema,
} from "@kortyx/telemetry-contracts";
import { streamSSE } from "hono/streaming";
import type { StudioChangeBus } from "../realtime/studio-change-bus";
import type { ApiEnv } from "../types";

const changesRoute = createRoute({
  method: "get",
  path: "/v1/studio/changes",
  request: {
    query: z.object({
      resources: z.string().optional(),
    }),
  },
  security: [{ TelemetryApiKey: [] }],
  responses: {
    200: {
      description: "A project-scoped stream of Studio resource invalidations.",
      content: {
        "text/event-stream": {
          schema: z.string(),
        },
      },
    },
    401: {
      description: "Missing or invalid API key.",
    },
    403: {
      description: "API key lacks Studio read permission.",
    },
  },
});

const parseRequestedResources = (
  value: string | undefined,
): Set<StudioChangeResource> | undefined => {
  if (!value) return undefined;
  const resources = value
    .split(",")
    .map((item) => StudioChangeResourceSchema.safeParse(item.trim()))
    .filter((item) => item.success)
    .map((item) => item.data);
  return resources.length > 0 ? new Set(resources) : undefined;
};

const mergeChanges = (
  current: StudioChange | undefined,
  incoming: StudioChange,
): StudioChange => {
  if (!current) return incoming;
  return {
    ...incoming,
    resources: [...new Set([...current.resources, ...incoming.resources])],
  };
};

export const registerStudioChangeRoutes = (
  app: OpenAPIHono<ApiEnv>,
  bus: StudioChangeBus,
): void => {
  app.openapi(changesRoute, (c) => {
    const auth = c.get("auth");
    const requestedResources = parseRequestedResources(
      c.req.valid("query").resources,
    );

    c.header("Cache-Control", "no-cache, no-store, no-transform");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no");

    return streamSSE(c, async (stream) => {
      let aborted = false;
      let pending: StudioChange | undefined;
      let wake:
        | ((change: StudioChange | "heartbeat" | "aborted") => void)
        | undefined;

      const push = (change: StudioChange) => {
        const relevant =
          !requestedResources ||
          change.resources.some((resource) => requestedResources.has(resource));
        if (!relevant) return;
        if (wake) {
          const resolve = wake;
          wake = undefined;
          resolve(change);
          return;
        }
        pending = mergeChanges(pending, change);
      };

      const unsubscribe = bus.subscribe(
        {
          organizationId: auth.organizationId,
          projectId: auth.projectId,
        },
        push,
      );

      stream.onAbort(() => {
        aborted = true;
        const resolve = wake;
        wake = undefined;
        resolve?.("aborted");
      });

      const next = (): Promise<StudioChange | "heartbeat" | "aborted"> => {
        if (pending) {
          const change = pending;
          pending = undefined;
          return Promise.resolve(change);
        }
        return new Promise((resolve) => {
          let wakeHandler:
            | ((change: StudioChange | "heartbeat" | "aborted") => void)
            | undefined;
          const heartbeat = setTimeout(() => {
            if (wake === wakeHandler) wake = undefined;
            resolve("heartbeat");
          }, 15_000);
          wakeHandler = (value) => {
            clearTimeout(heartbeat);
            resolve(value);
          };
          wake = wakeHandler;
        });
      };

      try {
        await stream.writeSSE({
          event: "ready",
          data: JSON.stringify({ connected: true }),
          retry: 3_000,
        });

        while (!aborted) {
          const change = await next();
          if (change === "aborted") break;
          if (change === "heartbeat") {
            await stream.writeSSE({
              event: "heartbeat",
              data: JSON.stringify({ at: new Date().toISOString() }),
            });
            continue;
          }
          await stream.writeSSE({
            id: change.changeId,
            event: "change",
            data: JSON.stringify(change),
          });
        }
      } finally {
        unsubscribe();
      }
    });
  });
};
