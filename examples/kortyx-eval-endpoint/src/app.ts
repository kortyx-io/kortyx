import { Hono } from "hono";
import { createEvalRouteHandler } from "kortyx";
import { evals } from "./evals";

export function createApp(serviceKey: string) {
  const app = new Hono();
  const handleEvals = createEvalRouteHandler({ evals, serviceKey });
  app.on(["GET", "POST"], "/api/evals", (c) => handleEvals(c.req.raw));
  return app;
}
