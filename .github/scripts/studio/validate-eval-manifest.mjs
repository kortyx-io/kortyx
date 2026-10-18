import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchEvalManifest } from "/app/apps/api/src/evals/targets.ts";

// Exercise the release image's actual discovery parser with the consumer payload.
const manifest = JSON.parse(
  readFileSync("/tmp/consumer-manifest.json", "utf8"),
);
const target = { url: "http://consumer.test/evals", serviceKey: "unused" };
const discover = (body) =>
  fetchEvalManifest(target, undefined, async () => Response.json(body));
assert.deepEqual(await discover(manifest), manifest);
await assert.rejects(
  discover({ ...manifest, schemaVersion: 999 }),
  (error) => error.diagnostic?.code === "manifest_invalid",
);
console.log(
  "Release API accepts the published SDK manifest, including evidence",
);
