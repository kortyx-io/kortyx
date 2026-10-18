import { serve } from "@hono/node-server";
import { createApp } from "./app";

const serviceKey = process.env.EVAL_SERVICE_KEY;
if (!serviceKey) throw new Error("EVAL_SERVICE_KEY is required");
const port = Number(process.env.PORT ?? 3210);
serve({ fetch: createApp(serviceKey).fetch, port }, () => {
  console.log(`Catalog eval endpoint listening on port ${port}: /api/evals`);
});
