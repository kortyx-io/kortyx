/**
 * Prompt compiler core. Pure functions, no I/O, no registry.
 *
 * Used by `_registry.ts` to turn a static `PromptTemplate` plus per-call
 * variables into a `{ system, user }` pair ready for `useReason`. Kept
 * registry-free so the compiler can be unit-tested in isolation and so
 * a future remote prompt provider can reuse the exact same compile step
 * on externally-loaded templates.
 *
 * Conditional behaviour deliberately does NOT live here — branching is a
 * routing decision and belongs in node code, expressed as a prompt-name
 * SELECTION between sibling templates (e.g. `confirm-save.prompt-driven`
 * vs `confirm-save.update-fallback`). The compiler only fills slots.
 */

import { CHAT_MARKDOWN_STYLE } from "./chat-style";
import {
  POLICY_RULES_BLOCK,
  PROTECTED_CHARACTERISTICS_SENTENCE,
} from "./policy";

/**
 * Static representation of one prompt. `name` is the canonical registry
 * key, `variables` declares caller-provided slots, and `system` + `user`
 * are the template strings.
 */
export type PromptTemplate = {
  readonly name: string;
  readonly description?: string;
  /**
   * Caller-provided variable names (excluding well-known fragments). The
   * compiler throws if any of these are missing at call time, so prompts
   * never silently render an empty string for a forgotten field.
   */
  readonly variables: readonly string[];
  readonly system: string;
  readonly user: string;
};

/** Pre-rendered prompt ready to hand to `useReason`. */
export type CompiledPrompt = {
  system: string;
  user: string;
};

/**
 * Fragment slots auto-filled from `lib/`. Templates can reference any of
 * these by name; unused ones are simply not touched. Adding a new entry
 * here makes the slot available to every template — keep the list
 * intentionally short.
 */
const FRAGMENT_NAMES = [
  "markdownStyle",
  "policyRules",
  "protectedCharacteristics",
] as const;
type FragmentName = (typeof FRAGMENT_NAMES)[number];

function buildFragmentValues(): Record<FragmentName, string> {
  return {
    markdownStyle: CHAT_MARKDOWN_STYLE,
    policyRules: POLICY_RULES_BLOCK,
    protectedCharacteristics: PROTECTED_CHARACTERISTICS_SENTENCE,
  };
}

/**
 * Minimal mustache compiler. Supports `{{varName}}` slots only, with no
 * helpers and no nesting. If a template ever needs branching or loops,
 * that's the signal to split it into multiple templates.
 *
 * Throws on unknown variable references so typos surface immediately
 * instead of silently emitting `""`. The legacy `create-canvas.ts`
 * compiler tolerated missing keys; the strictness here catches real
 * bugs at the cost of forcing callers to pass every variable explicitly.
 */
function compile(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined) {
      throw new Error(
        `prompt compile error: unknown variable "${key}" referenced by template`,
      );
    }
    return value;
  });
}

/**
 * Build a compiled `{ system, user }` pair from a static template.
 *
 * Resolution order: caller `vars` win over fragment defaults (so a
 * template could in principle opt out of the shared markdown style by
 * supplying its own `markdownStyle`, though we don't currently do this).
 */
export function compilePrompt(
  template: PromptTemplate,
  vars: Record<string, string | undefined>,
): CompiledPrompt {
  const fragments = buildFragmentValues();

  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) cleaned[k] = v;
  }

  for (const v of template.variables) {
    if (!(v in cleaned)) {
      throw new Error(
        `prompt "${template.name}" missing required variable "${v}"`,
      );
    }
  }

  const merged: Record<string, string> = { ...fragments, ...cleaned };
  return {
    system: compile(template.system, merged),
    user: compile(template.user, merged),
  };
}
