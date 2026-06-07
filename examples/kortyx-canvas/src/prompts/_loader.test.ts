import { describe, expect, it } from "vitest";
import type { PromptTemplate } from "./_loader";
import { compilePrompt } from "./_loader";
import { CHAT_MARKDOWN_STYLE } from "./chat-style";
import {
  POLICY_RULES_BLOCK,
  PROTECTED_CHARACTERISTICS_SENTENCE,
} from "./policy";

const t = (
  partial: Partial<PromptTemplate> & Pick<PromptTemplate, "system" | "user">,
): PromptTemplate => ({
  name: "test",
  variables: [],
  ...partial,
});

describe("compilePrompt", () => {
  it("fills well-known fragments from lib/", () => {
    const tpl = t({
      system: "Style:\n{{markdownStyle}}\nPolicy:\n{{policyRules}}",
      user: "{{protectedCharacteristics}}",
    });
    const out = compilePrompt(tpl, {});
    expect(out.system).toContain(CHAT_MARKDOWN_STYLE);
    expect(out.system).toContain(POLICY_RULES_BLOCK);
    expect(out.user).toBe(PROTECTED_CHARACTERISTICS_SENTENCE);
  });

  it("throws when a declared variable is missing", () => {
    const tpl = t({
      variables: ["briefTitle"],
      system: "{{briefTitle}}",
      user: "",
    });
    expect(() => compilePrompt(tpl, {})).toThrow(/missing required variable/i);
  });

  it("throws when the template references an unknown variable", () => {
    const tpl = t({
      system: "Hello {{unknownThing}}",
      user: "",
    });
    expect(() => compilePrompt(tpl, {})).toThrow(/unknown variable/i);
  });

  it("substitutes caller-provided variables", () => {
    const tpl = t({
      variables: ["name"],
      system: "Hello {{name}}",
      user: "Welcome {{name}}",
    });
    const out = compilePrompt(tpl, { name: "Ada" });
    expect(out.system).toBe("Hello Ada");
    expect(out.user).toBe("Welcome Ada");
  });

  it("allows caller vars to override fragment defaults", () => {
    const tpl = t({
      variables: ["markdownStyle"],
      system: "{{markdownStyle}}",
      user: "",
    });
    expect(compilePrompt(tpl, { markdownStyle: "OVERRIDDEN" }).system).toBe(
      "OVERRIDDEN",
    );
  });

  it("ignores `undefined` caller values (treats them as missing)", () => {
    const tpl = t({
      variables: ["foo"],
      system: "{{foo}}",
      user: "",
    });
    expect(() => compilePrompt(tpl, { foo: undefined })).toThrow(
      /missing required variable "foo"/,
    );
  });
});
