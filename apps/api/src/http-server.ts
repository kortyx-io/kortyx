import { serve } from "@hono/node-server";

// Let proxies with a 60-second idle timeout close idle connections first.
export const API_KEEP_ALIVE_TIMEOUT_MS = 70_000;

export const startApiHttpServer = (
  options: Pick<Parameters<typeof serve>[0], "fetch" | "hostname" | "port">,
) =>
  serve({
    ...options,
    serverOptions: { keepAliveTimeout: API_KEEP_ALIVE_TIMEOUT_MS },
  });
