import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  compilePrompt,
  createPrompts,
  definePrompt,
  expandPromptMessages,
  localPromptSource,
  type PromptContent,
  type PromptVersion,
  promptHash,
  promptReferenceToken,
  promptUsageMetadata,
  verifyPromptSnapshot,
} from "../src";

const body: PromptContent = {
  format: "system-user",
  messages: [
    { role: "system", content: "Follow {{policy}}." },
    { role: "user", content: "Question: {{message}}" },
  ],
  variablesSchema: {
    type: "object",
    properties: { policy: { type: "string" }, message: { type: "string" } },
    required: ["policy", "message"],
  },
  configSchema: {},
  config: {},
  dependencies: [],
};
async function fixture() {
  const child: PromptVersion = {
    id: "shared/rules",
    version: 9,
    content: body,
    hash: await promptHash(body),
  };
  const content = {
    ...body,
    messages: [
      {
        role: "system" as const,
        content: `Before\n${promptReferenceToken(child.id)}\nAfter`,
      },
      { role: "user" as const, content: promptReferenceToken(child.id) },
    ],
    dependencies: [{ id: child.id, version: child.version, hash: child.hash }],
  };
  const root: PromptVersion = {
    id: "main",
    version: 1,
    content,
    hash: await promptHash(content),
  };
  return { root, child, versions: { main: root, [child.id]: child } };
}
describe("prompt inclusions", () => {
  it("includes matching roles, fills inherited inputs and records exact dependency provenance", async () => {
    const { root, child, versions } = await fixture();
    const ref = definePrompt({
      id: "main",
      format: "system-user",
      variables: z.object({ policy: z.string(), message: z.string() }),
      config: z.object({}),
    });
    const compiled = compilePrompt(
      ref,
      root,
      { policy: "company policy", message: "hello" },
      { source: "studio", environment: "production", snapshotRevision: "r1" },
      versions,
    );
    expect(compiled.system).toBe("Before\nFollow company policy.\nAfter");
    expect(compiled.user).toBe("Question: hello");
    expect(promptUsageMetadata(compiled).dependencies).toEqual([
      { id: child.id, version: 9, hash: child.hash },
    ]);
    expect(compiled.config).toEqual({});
  });
  it("expands recursively and deduplicates references", async () => {
    const { root, child, versions } = await fixture();
    const fragment = {
      ...child,
      id: "base",
      content: {
        ...body,
        messages: [
          { role: "system" as const, content: "Base" },
          body.messages[1]!,
        ],
      },
    };
    const nested = {
      ...child,
      content: {
        ...body,
        messages: [
          {
            role: "system" as const,
            content: "[[prompt:base]] [[prompt:base]]",
          },
          body.messages[1]!,
        ],
        dependencies: [
          { id: fragment.id, version: fragment.version, hash: fragment.hash },
        ],
      },
    };
    const expanded = expandPromptMessages(root, {
      ...versions,
      [child.id]: nested,
      base: fragment,
    });
    expect(expanded.messages[0]?.content).toBe("Before\nBase Base\nAfter");
    expect(expanded.used.map((item) => item.id)).toEqual([child.id, "base"]);
  });
  for (const mismatch of ["missing", "version", "hash", "manifest"] as const)
    it(`rejects a ${mismatch} dependency`, async () => {
      const { root, child, versions } = await fixture();
      if (mismatch === "manifest") root.content.dependencies = [];
      if (mismatch === "version")
        versions[child.id] = { ...child, version: 10 };
      if (mismatch === "hash")
        versions[child.id] = { ...child, hash: "0".repeat(64) };
      if (mismatch === "missing")
        delete (versions as Record<string, PromptVersion>)[child.id];
      expect(() => expandPromptMessages(root, versions)).toThrow(
        "Include an exact dependency",
      );
    });
  it("rejects missing roles, cycles and expanded text overflow", async () => {
    const { root, child, versions } = await fixture();
    expect(() =>
      expandPromptMessages(root, {
        ...versions,
        [child.id]: {
          ...child,
          content: { ...body, messages: [body.messages[1]!] },
        },
      }),
    ).toThrow("no system message");
    const cyclic = {
      ...child,
      content: {
        ...body,
        messages: [{ role: "system" as const, content: "[[prompt:main]]" }],
        dependencies: [{ id: root.id, version: 1, hash: root.hash }],
      },
    };
    expect(() =>
      expandPromptMessages(root, { ...versions, [child.id]: cyclic }),
    ).toThrow("cycle");
    const huge = {
      ...child,
      content: {
        ...body,
        messages: [{ role: "system" as const, content: "x".repeat(200_000) }],
      },
    };
    expect(() =>
      expandPromptMessages(root, { ...versions, [child.id]: huge }),
    ).toThrow("200,000");
  });
  it("uses the immutable snapshot for local serving and resumed execution", async () => {
    const { versions, child } = await fixture();
    const snapshot = await verifyPromptSnapshot({
      schemaVersion: 1,
      environment: "production",
      revision: "r1",
      source: "studio",
      resolvedAt: new Date().toISOString(),
      versions,
    });
    const ref = definePrompt({
      id: "main",
      format: "system-user",
      variables: z.object({ policy: z.string(), message: z.string() }),
      config: z.object({}),
    });
    const manager = createPrompts({
      definitions: [ref],
      source: localPromptSource(snapshot),
    });
    const result = await manager.start().resolve(ref, {
      variables: { policy: "[[prompt:untrusted]]", message: "{{policy}}" },
      stored: snapshot,
    });
    expect(result.system).toBe("Before\nFollow [[prompt:untrusted]].\nAfter");
    expect(result.user).toBe("Question: {{policy}}");
    expect(result.dependencies?.[0]?.hash).toBe(child.hash);
  });
});
