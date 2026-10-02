// Deterministic, loopback-only consumer for navigation and launch E2E tests.
// Real model/permission behavior is verified separately in application smoke runs.

import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createEvalRouteHandler, createEvals } from "@kortyx/agent";
import postgres from "postgres";
import { EVAL_FIXTURE, EVAL_OPAQUE_SUITE, EVAL_SUITE } from "./eval-plan";

async function main() {
  const port = Number(process.env.KORTYX_E2E_CONSUMER_PORT ?? "6501");
  const targetFile = process.env.KORTYX_E2E_TARGETS_FILE;
  if (!targetFile || !process.env.DATABASE_URL)
    throw new Error("E2E target file and database required");
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const [scope] =
    await sql`select organization_id, id as project_id from projects where name = 'Default Project' limit 1`;
  await sql.end();
  if (!scope) throw new Error("Bootstrap the E2E project first");
  const key = "e2e-only-eval-consumer-service-key-at-least-32-characters";
  writeFileSync(
    targetFile,
    JSON.stringify([
      {
        id: EVAL_FIXTURE.targetId,
        name: "E2E eval application",
        organizationId: scope.organization_id,
        projectId: scope.project_id,
        environment: "development",
        url: `http://127.0.0.1:${port}/evals`,
        serviceKey: key,
        allowInsecureHttp: true,
      },
    ]),
    { mode: 0o600 },
  );
  const evals = createEvals({
    agent: {
      streamChat: () => {
        throw new Error("The E2E fixture must use its deterministic executor");
      },
    },
    suites: [EVAL_SUITE, EVAL_OPAQUE_SUITE],
    execute: ({ command, case: item }) => {
      if (item.id === "human-choice" && command.type === "message")
        return {
          continuation: {},
          observation: {
            type: "interrupt",
            text: "Choose a city",
            structured: [],
            interrupt: {
              requestId: "choice",
              kind: "choice",
              schemaId: "job-picker",
              schemaVersion: "1",
              options: [{ id: "paris", label: "Paris" }],
            },
          },
        };
      return {
        observation: {
          type: "answer",
          text: "Software Engineer role description",
          structured: [],
        },
      };
    },
    judge: {
      id: "fixture-judge",
      version: "1",
      grade: () => ({
        passed: true,
        reason: "Deterministic fixture answer",
        evidence: ["Software Engineer role description"],
      }),
    },
  });
  const handler = createEvalRouteHandler({ evals, serviceKey: key });
  createServer(async (req, res) => {
    if (req.url === "/health") {
      res.end("ready");
      return;
    }
    try {
      let body = "";
      for await (const part of req) body += part;
      const response = await handler(
        new Request(`http://127.0.0.1:${port}/evals`, {
          method: req.method,
          headers: {
            authorization: req.headers.authorization ?? "",
            "content-type": "application/json",
          },
          ...(req.method === "POST" ? { body } : {}),
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body)
        Readable.fromWeb(
          response.body as Parameters<typeof Readable.fromWeb>[0],
        ).pipe(res);
      else res.end();
    } catch {
      res.writeHead(500);
      res.end("Fixture failure");
    }
  }).listen(port, "127.0.0.1");
}
void main();
