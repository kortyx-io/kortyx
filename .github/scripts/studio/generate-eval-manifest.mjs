import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Resolve the consumer's published SDK, never the repository workspace copy.
const require = createRequire(resolve(process.argv[2], "package.json"));
const { createEvals, createEvalRouteHandler } = await import(
  pathToFileURL(require.resolve("kortyx")).href
);
const evidence = {
  history: false,
  events: ["tool-call-result"],
  outputs: [{ dataType: "release.answer" }],
};
const evals = createEvals({
  agent: {
    streamChat: () => {
      throw new Error("Discovery must not run an agent");
    },
  },
  defaults: { evidence },
  suites: [
    {
      id: "release-compatibility",
      cases: [
        {
          id: "answer",
          steps: [{ message: "Hello", expect: { type: "answer" } }],
        },
      ],
    },
  ],
});
const serviceKey = "release-compatibility-test-key-at-least-32-chars";
const handler = createEvalRouteHandler({ evals, serviceKey });
assert.equal(
  (await handler(new Request("http://consumer.test/evals"))).status,
  401,
);
const response = await handler(
  new Request("http://consumer.test/evals", {
    headers: { authorization: `Bearer ${serviceKey}` },
  }),
);
assert.equal(response.status, 200);
const manifest = await response.json();
assert.deepEqual(manifest.suites[0].evidence, evidence);
writeFileSync(process.argv[3], JSON.stringify(manifest));
console.log(
  "Generated authenticated eval manifest with evidence from the published SDK",
);
