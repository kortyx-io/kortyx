import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { saveConnections } from "../src/connections";
import { StudioEvalClient } from "../src/studio/eval-client";
import { registerStudioEvalCommands } from "../src/studio/eval-command";
import {
  evalReadCompatibility,
  readEvalInspection,
} from "../src/studio/eval-inspection";
import { StudioReadClient } from "../src/studio/read-client";
import { registerStudioReadCommands } from "../src/studio/read-command";

const id = "10000000-0000-4000-8000-000000000252";
const key = "ktyx_test_studio_testsecret";
const homes: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});
const result = (
  view = "overview",
  data: unknown = { counts: { error: 2 } },
) => ({
  inspectionVersion: 1,
  id,
  view,
  data,
  page: { available: 146, returned: 25, omitted: 121, nextCursor: 25 },
  expand: [
    {
      command: `kortyx studio evals evidence ${id}`,
      args: { suite: id, case: "F14", repetition: "1", section: "criteria" },
    },
  ],
});
async function configured() {
  const home = await mkdtemp(join(tmpdir(), "kortyx-bounded-inspection-"));
  homes.push(home);
  vi.stubEnv("KORTYX_INSPECTION_TEST_KEY", key);
  vi.stubEnv("KORTYX_CONNECTION", "");
  await saveConnections(
    {
      version: 1,
      profiles: [
        {
          name: "staging",
          apiUrl: "https://api.example.test",
          studioUrl: "https://studio.example.test",
          apiKeyEnv: "KORTYX_INSPECTION_TEST_KEY",
          environment: "development",
        },
      ],
    },
    home,
  );
  return { connection: "staging", configHome: home, home };
}
describe("bounded evaluation CLI", () => {
  it("dispatches evaluation and saved suite URLs through generic inspect without fetching results", async () => {
    const options = await configured();
    for (const kind of ["evaluations", "runs"]) {
      const request = vi.fn<typeof fetch>(async () => Response.json(result()));
      const output: string[] = [],
        root = new Command("studio");
      registerStudioReadCommands(root, (text) => output.push(text), request);
      await root.parseAsync(
        [
          "inspect",
          `https://studio.example.test/evals/${kind}/${id}?token=do-not-send`,
          "--connection",
          "staging",
          "--config-home",
          options.configHome,
          "--home",
          options.home,
          "--json",
        ],
        { from: "user" },
      );
      expect(request).toHaveBeenCalledTimes(1);
      expect(String(request.mock.calls[0]?.[0])).toContain(
        `/inspection/${id}?view=overview`,
      );
      expect(output[0]).not.toContain("do-not-send");
      expect(JSON.parse(output[0] ?? "").expand[0].command).toContain(
        "--include-content",
      );
      expect(JSON.parse(output[0] ?? "").expand[0].command).toContain(
        "--connection 'staging'",
      );
    }
  });
  it("sends pagination and selection before downloading and preserves response counts", async () => {
    const options = await configured();
    const request = vi.fn<typeof fetch>(async () =>
      Response.json(result("attempts", [])),
    );
    const value = await readEvalInspection(
      id,
      {
        ...options,
        suite: "sift",
        case: "F14",
        status: "error",
        phase: "execute",
        repetition: 1,
        cursor: 25,
        limit: 10,
      },
      request,
      "attempts",
    );
    const url = new URL(String(request.mock.calls[0]?.[0]));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      view: "attempts",
      suite: "sift",
      caseId: "F14",
      status: "error",
      phase: "execute",
      repetition: "1",
      cursor: "25",
      limit: "10",
    });
    expect(value.page).toMatchObject({ omitted: 121, nextCursor: 25 });
    expect(request.mock.calls[0]?.[1]?.method).toBe("GET");
  });
  it("exports bounded evidence into a private file and refuses overwrites", async () => {
    const options = await configured(),
      file = join(options.home, "evidence.json");
    const root = new Command("studio"),
      output: string[] = [];
    registerStudioEvalCommands(
      root,
      (text) => output.push(text),
      vi.fn<typeof fetch>(async () =>
        Response.json(
          result("evidence", {
            content: "Captured evidence",
            format: "json-text",
          }),
        ),
      ),
    );
    const args = [
      "evals",
      "evidence",
      id,
      "--connection",
      "staging",
      "--config-home",
      options.configHome,
      "--include-content",
      "--output",
      file,
      "--json",
    ];
    await root.parseAsync(args, { from: "user" });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readFile(file, "utf8")).toContain("Captured evidence");
    await expect(root.parseAsync(args, { from: "user" })).rejects.toMatchObject(
      { code: "EEXIST" },
    );
  });
  it("reports unsupported eval reads independently from general connectivity", async () => {
    const request = vi.fn<typeof fetch>(
      async () => new Response("missing", { status: 404 }),
    );
    const client = new StudioEvalClient(
      "https://api.example.test",
      key,
      request,
    );
    expect(await evalReadCompatibility(client)).toMatchObject({
      status: "unsupported",
    });
    await expect(client.inspection(id)).rejects.toMatchObject({
      code: "eval_inspection_unavailable",
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      request.mock.calls.every(([url]) => String(url).includes("/inspection/")),
    ).toBe(true);
  });
  it("exposes declared capabilities and propagates authentication failures", async () => {
    const supported = new StudioEvalClient(
      "https://api.example.test",
      key,
      vi.fn<typeof fetch>(async () =>
        Response.json({
          inspectionVersion: 1,
          views: ["overview"],
          maxPageSize: 100,
          maxContentLength: 32768,
        }),
      ),
    );
    expect(await evalReadCompatibility(supported)).toMatchObject({
      status: "supported",
      inspectionVersion: 1,
    });
    const denied = new StudioEvalClient(
      "https://api.example.test",
      key,
      vi.fn<typeof fetch>(async () => new Response("denied", { status: 403 })),
    );
    await expect(evalReadCompatibility(denied)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("reports incompatible schema fields and versions without received values", async () => {
    const client = new StudioReadClient(
      "https://api.example.test",
      key,
      vi.fn<typeof fetch>(async () =>
        Response.json(
          { run: { counts: { passed: "Bearer TOP_SECRET" } } },
          {
            headers: {
              "x-kortyx-studio-api-version": "1",
              "x-kortyx-studio-release": "server-1",
              "x-request-id": "request-1",
            },
          },
        ),
      ),
    );
    const schema = z.object({
      run: z.object({ counts: z.object({ passed: z.number() }) }),
    });
    const error = await client
      .get("/v1/studio/context", schema)
      .catch((error) => error);
    expect(error.message).toContain("run.counts.passed");
    expect(error.toJSON()).toMatchObject({
      error: {
        requestId: "request-1",
        details: {
          serverVersion: "server-1",
          issues: [{ path: ["run", "counts", "passed"], code: "invalid_type" }],
        },
      },
    });
    expect(JSON.stringify(error.toJSON())).not.toContain("TOP_SECRET");
  });
});
