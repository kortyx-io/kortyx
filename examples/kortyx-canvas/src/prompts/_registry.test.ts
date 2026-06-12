/**
 * Registry smoke tests. After Phase 2 the parity suites against the
 * legacy builders were deleted — these tests are the lightweight
 * replacement that ensures every registered prompt is internally
 * consistent and addressable through the public `loadPrompt` API.
 */
import { describe, expect, it } from "vitest";
import { loadPrompt, PROMPT_REGISTRY, type PromptName } from "./_registry";

const KNOWN_FRAGMENTS = new Set([
  "markdownStyle",
  "policyRules",
  "protectedCharacteristics",
]);

const PROMPT_NAMES = Object.keys(PROMPT_REGISTRY) as PromptName[];

describe("prompt registry", () => {
  it("has at least the prompts Phase 2 should produce", () => {
    // Smoke check on count — if this drops below the Phase 2 baseline
    // (~30) without an explicit reason, someone deleted prompts.
    expect(PROMPT_NAMES.length).toBeGreaterThanOrEqual(30);
  });

  it.each(
    PROMPT_NAMES,
  )('"%s" compiles when all declared vars are supplied', (name) => {
    const template = PROMPT_REGISTRY[name];
    const vars: Record<string, string> = {};
    for (const v of template.variables) vars[v] = "__stub__";
    const compiled = loadPrompt(name, vars);
    expect(typeof compiled.system).toBe("string");
    expect(typeof compiled.user).toBe("string");
  });

  it.each(
    PROMPT_NAMES,
  )('"%s" only references its declared variables (plus well-known fragments)', (name) => {
    const template = PROMPT_REGISTRY[name];
    const declared = new Set(template.variables);
    const referenced = new Set<string>();
    const re = /\{\{(\w+)\}\}/g;
    for (const blob of [template.system, template.user]) {
      for (const m of blob.matchAll(re)) {
        referenced.add(m[1] as string);
      }
    }
    for (const ref of referenced) {
      if (KNOWN_FRAGMENTS.has(ref)) continue;
      expect(
        declared.has(ref),
        `unknown var \`${ref}\` in prompt \`${name}\``,
      ).toBe(true);
    }
  });
});
