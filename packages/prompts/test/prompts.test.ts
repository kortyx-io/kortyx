import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  compilePrompt,
  createPrompts,
  definePrompt,
  isCompiledPrompt,
  isPromptUsageMetadata,
  localPromptSource,
  type PromptContent,
  type PromptSnapshot,
  promptHash,
  promptUsageMetadata,
  studioPromptSource,
  validatePromptContent,
  validatePromptValue,
  verifyPromptSnapshot,
} from "../src";

const reference = definePrompt({
  id: "classify",
  format: "system-user",
  variables: z.object({ message: z.string() }),
  config: z.object({ modelName: z.enum(["fast", "accurate"]) }),
});
const content: PromptContent = {
  format: "system-user",
  messages: [
    { role: "system", content: "Classify the user." },
    { role: "user", content: "{{message}}" },
  ],
  variablesSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
    additionalProperties: false,
  },
  configSchema: {
    type: "object",
    properties: { modelName: { enum: ["fast", "accurate"] } },
    required: ["modelName"],
  },
  config: { modelName: "fast" },
  dependencies: [],
};
async function snapshot(version = 1, body = content): Promise<PromptSnapshot> {
  return {
    schemaVersion: 1,
    environment: "staging",
    revision: `r${version}`,
    source: "studio",
    resolvedAt: new Date().toISOString(),
    versions: {
      classify: {
        id: "classify",
        version,
        content: body,
        hash: await promptHash(body),
      },
    },
  };
}

describe("versioned prompt contracts", () => {
  it("rejects invalid stored schemas, undeclared inputs and config/input overlap", () => {
    for (const candidate of [
      { ...content, variablesSchema: { type: "unsupported" } },
      { ...content, configSchema: { type: "unsupported" } },
      {
        ...content,
        messages: [{ role: "user" as const, content: "{{unknown}}" }],
      },
      {
        ...content,
        configSchema: { type: "object" },
        config: { message: "saved" },
      },
    ])
      expect(() => validatePromptContent(candidate)).toThrow();
    expect(() =>
      validatePromptValue(
        { type: "object", required: ["message"] },
        {},
        "Inputs",
      ),
    ).toThrow("Inputs");
    expect(() => definePrompt({ ...reference, id: "" })).toThrow("reference");
  });
  it("renders nested JSON inputs while rejecting missing and prototype paths", async () => {
    const ref = definePrompt({
      id: "classify",
      format: "system-user",
      variables: z.unknown(),
      config: z.object({ modelName: z.string() }),
    });
    const identity = {
      source: "local",
      environment: "staging",
      snapshotRevision: "r1",
    };
    const make = (template: string, variables: unknown) =>
      compilePrompt(
        ref,
        {
          id: "classify",
          version: 1,
          hash: "a".repeat(64),
          content: {
            ...content,
            variablesSchema: { type: "object" },
            messages: [
              { role: "system", content: "Classify" },
              { role: "user", content: template },
            ],
          },
        },
        variables,
        identity,
      );
    expect(
      make("{{person.name}}: {{person.score}} {{person.data}}", {
        person: { name: "Ada", score: 42, data: { b: true, a: null } },
      }).user,
    ).toBe('Ada: 42 {"a":null,"b":true}');
    for (const [template, variables] of [
      ["{{message}}", {}],
      ["{{message}}", { message: undefined }],
      ["{{person.name}}", { person: null }],
      ["{{person.name}}", { person: "text" }],
      ["{{person.constructor}}", { person: { constructor: "unsafe" } }],
    ] as const)
      expect(() => make(template, variables)).toThrow("Missing template input");
    const version = (await snapshot()).versions.classify!;
    expect(() =>
      compilePrompt(
        { ...reference, id: "other" },
        version,
        { message: "Hi" },
        identity,
      ),
    ).toThrow("identity");
    const compiled = make("{{message}}", { message: "Hi" });
    expect(isCompiledPrompt(compiled)).toBe(true);
    expect(isCompiledPrompt(JSON.parse(JSON.stringify(compiled)))).toBe(false);
    const receipt = promptUsageMetadata(compiled);
    expect(isPromptUsageMetadata(receipt)).toBe(true);
    expect(isPromptUsageMetadata({ ...receipt })).toBe(false);
    expect(receipt).not.toHaveProperty("config");
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(() => promptUsageMetadata({ ...compiled })).toThrow(
      "compiled prompt",
    );
  });
  it("enforces environment and exact-version matching for a portable local source", async () => {
    const source = localPromptSource(await snapshot());
    expect(
      (
        await source.resolve(["classify"], {
          environment: "staging",
          versions: { classify: 1 },
        })
      ).source,
    ).toBe("local");
    await expect(
      source.resolve(["classify"], { environment: "production" }),
    ).rejects.toMatchObject({ code: "PROMPT_ENVIRONMENT_MISMATCH" });
    await expect(
      source.resolve(["unknown"], { environment: "staging" }),
    ).rejects.toMatchObject({ code: "PROMPT_NOT_FOUND" });
    await expect(
      source.resolve(["classify"], {
        environment: "staging",
        versions: { classify: 2 },
      }),
    ).rejects.toMatchObject({ code: "PROMPT_NOT_FOUND" });
  });
  it("resolves both roles and configuration without substituting configuration", async () => {
    const wire = await snapshot();
    const result = compilePrompt(
      reference,
      wire.versions.classify!,
      { message: "{{modelName}}" },
      { environment: "staging", source: "studio", snapshotRevision: "r1" },
    );
    expect(result.messages).toEqual([
      { role: "system", content: "Classify the user." },
      { role: "user", content: "{{modelName}}" },
    ]);
    expect(result.config.modelName).toBe("fast");
    expect(result.ref.hash).toHaveLength(64);
  });
  it("rejects corrupted versions and broken dependency closures", async () => {
    const wire = await snapshot();
    wire.versions.classify!.content.config.modelName = "accurate";
    await expect(verifyPromptSnapshot(wire)).rejects.toMatchObject({
      code: "PROMPT_HASH_MISMATCH",
    });
    const broken = await snapshot(1, {
      ...content,
      dependencies: [{ id: "fragment", version: 2, hash: "a".repeat(64) }],
    });
    await expect(verifyPromptSnapshot(broken)).rejects.toMatchObject({
      code: "PROMPT_DEPENDENCY_MISMATCH",
    });
  });
  it("freezes an execution while a later execution observes promotion", async () => {
    let live = await snapshot();
    const source = {
      identity: "test-project",
      environment: "staging",
      resolve: vi.fn(async () => structuredClone(live)),
    };
    const manager = createPrompts({ definitions: [reference], source });
    const first = manager.start();
    expect(
      (await first.resolve(reference, { variables: { message: "first" } })).ref
        .version,
    ).toBe(1);
    live = await snapshot(2);
    expect(
      (await first.resolve(reference, { variables: { message: "next" } })).ref
        .version,
    ).toBe(1);
    expect(
      (
        await manager
          .start()
          .resolve(reference, { variables: { message: "new" } })
      ).ref.version,
    ).toBe(2);
    expect(source.resolve).toHaveBeenCalledTimes(2);
  });
  it("resumes an exact pin offline with new variables", async () => {
    const baseline = await snapshot(2),
      pin = await snapshot(1);
    const source = {
      identity: "test-project",
      environment: "staging",
      resolve: vi.fn(async () => {
        throw new Error("offline");
      }),
    };
    const execution = createPrompts({
      definitions: [reference],
      source,
    }).start();
    await execution.snapshot(baseline);
    const saved = await execution.pin("classify", 1, pin);
    const result = await execution.resolve(reference, {
      variables: { message: "continued" },
      version: 1,
      pin: saved,
    });
    expect(result.ref.version).toBe(1);
    expect(result.user).toBe("continued");
    expect(source.resolve).not.toHaveBeenCalled();
  });
  it("rejects pins conflicting with eval overrides", async () => {
    const baseline = { ...(await snapshot(2)), source: "eval" as const };
    const execution = createPrompts({
      definitions: [reference],
      source: localPromptSource(baseline),
    }).start({ snapshot: baseline });
    await expect(
      execution.pin("classify", 1, await snapshot()),
    ).rejects.toMatchObject({ code: "PROMPT_EVAL_PIN_CONFLICT" });
  });
  it("bounds stale fallback and refuses fallback after authorization revocation", async () => {
    let mode: "ok" | "offline" | "revoked" = "ok";
    const source = studioPromptSource({
      apiUrl: "https://studio.example",
      apiKey: "test",
      environment: "staging",
      retries: 0,
      fetch: async () => {
        if (mode === "offline") throw new Error("offline");
        return mode === "revoked"
          ? new Response("", { status: 403 })
          : Response.json(await snapshot());
      },
    });
    const manager = createPrompts({
      definitions: [reference],
      source,
      fallback: "last-known-good",
    });
    await manager.start().snapshot();
    mode = "offline";
    expect((await manager.start().snapshot()).source).toBe("fallback");
    mode = "revoked";
    await expect(manager.start().snapshot()).rejects.toMatchObject({
      status: 403,
    });
  });
  it("shares one atomic snapshot across concurrent prompt resolutions", async () => {
    const source = {
      identity: "concurrent-project",
      environment: "staging",
      resolve: vi.fn(async () => snapshot()),
    };
    const execution = createPrompts({
      definitions: [reference],
      source,
    }).start();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        execution.resolve(reference, { variables: { message: String(index) } }),
      ),
    );
    expect(source.resolve).toHaveBeenCalledTimes(1);
    expect(
      new Set(results.map((result) => result.ref.snapshotRevision)),
    ).toEqual(new Set(["r1"]));
    expect(results.map((result) => result.user)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
  });
  it("refuses expired fallback and corrupted HTTP snapshots", async () => {
    let mode: "ok" | "offline" | "corrupt" = "ok";
    const source = studioPromptSource({
      apiUrl: "https://studio.example",
      apiKey: "cache-scope",
      environment: "staging",
      retries: 0,
      fetch: async () => {
        if (mode === "offline") throw new Error("offline");
        return Response.json(
          mode === "corrupt" ? { unexpected: true } : await snapshot(),
        );
      },
    });
    const manager = createPrompts({
      definitions: [reference],
      source,
      fallback: "last-known-good",
      maxStaleMs: 100,
    });
    const before = Date.now();
    await manager.start().snapshot();
    mode = "corrupt";
    await expect(manager.start().snapshot()).rejects.toMatchObject({
      code: "PROMPT_SNAPSHOT_INVALID",
    });
    mode = "offline";
    vi.spyOn(Date, "now").mockReturnValue(before + 5000);
    try {
      await expect(manager.start().snapshot()).rejects.toThrow("offline");
    } finally {
      vi.restoreAllMocks();
    }
    expect(() =>
      createPrompts({ definitions: [reference], source, maxStaleMs: Infinity }),
    ).toThrow("finite");
  });
});
