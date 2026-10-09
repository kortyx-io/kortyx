import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { execa } from "execa";
import { expect, it } from "vitest";

it("blocks strict publication before HTTP requests and reports exemptions in JSON", async () => {
  const dir = await mkdtemp(join(process.cwd(), ".push-test-"));
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ workflowRevisionId: "revision", created: true }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No server address");
  try {
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { moduleResolution: "bundler", module: "esnext" },
      }),
    );
    const entry = join(dir, "entry.ts");
    const source = (
      comment = "",
    ) => `import {defineWorkflow} from "@kortyx/core";
      import {useWorkflow} from "../../hooks/src/index";
      export const workflows = [defineWorkflow({id:"parent",version:"1",nodes:{chat:{run:async({input})=>{
        ${comment}
        await useWorkflow({workflow: input.target, input:{}});
      }}},edges:[]})];`;
    const run = (...extra: string[]) =>
      execa(
        process.execPath,
        [
          "--import",
          "tsx",
          resolve("src/index.ts"),
          "topology",
          "push",
          "--entry",
          entry,
          "--api-url",
          `http://127.0.0.1:${address.port}`,
          "--api-key",
          "test",
          "--json",
          ...extra,
        ],
        { reject: false },
      );
    await writeFile(entry, source());
    const blocked = await run("--fail-on-unresolved-calls");
    expect(blocked.exitCode).toBe(1);
    expect(requests).toBe(0);
    expect(JSON.parse(blocked.stdout)).toMatchObject({
      publication: { status: "blocked", workflowCount: 0 },
      discovery: { status: "incomplete", unresolvedCallCount: 1 },
    });
    const blockedDryRun = await run("--dry-run", "--fail-on-unresolved-calls");
    expect(blockedDryRun.exitCode).toBe(1);
    expect(requests).toBe(0);
    const accepted = await run();
    expect(accepted.exitCode, accepted.stderr).toBe(0);
    expect(requests).toBe(1);
    expect(JSON.parse(accepted.stdout)).toMatchObject({
      publication: { status: "accepted", workflowCount: 1 },
      discovery: { status: "incomplete", unresolvedCallCount: 1 },
    });
    await writeFile(
      entry,
      source("// kortyx-dynamic-call: selected at runtime"),
    );
    const exempt = await run("--fail-on-unresolved-calls");
    expect(exempt.exitCode, exempt.stderr).toBe(0);
    expect(requests).toBe(2);
    expect(JSON.parse(exempt.stdout)).toMatchObject({
      discovery: {
        status: "incomplete",
        unresolvedCallCount: 0,
        exemptCallCount: 1,
      },
    });
    const dryRun = await run("--dry-run", "--fail-on-unresolved-calls");
    expect(dryRun.exitCode, dryRun.stderr).toBe(0);
    expect(requests).toBe(2);
    expect(JSON.parse(dryRun.stdout)).toMatchObject({
      publication: { status: "dry-run" },
    });
    await writeFile(entry, source().replace("input.target", '"parent"'));
    const complete = await run("--dry-run", "--fail-on-unresolved-calls");
    expect(complete.exitCode, complete.stderr).toBe(0);
    expect(JSON.parse(complete.stdout)).toMatchObject({
      discovery: { status: "complete", resolvedLinkCount: 1 },
    });
    await writeFile(
      entry,
      'export const workflows = [{id:"parent", version:"1", nodes:{chat:{run: async()=>{}}}, edges:[]}];',
    );
    const gap = await run("--fail-on-unresolved-calls");
    expect(gap.exitCode).toBe(1);
    expect(requests).toBe(2);
    expect(JSON.parse(gap.stdout)).toMatchObject({
      publication: { status: "blocked" },
      discovery: { status: "incomplete", gapCount: 1 },
    });
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 60_000);
