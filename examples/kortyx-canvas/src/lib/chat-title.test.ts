import { describe, expect, it } from "vitest";
import {
  sanitizeGeneratedChatTitle,
  stripChatTitlePresentationNoise,
} from "./chat-title";

describe("chat title helpers", () => {
  it("keeps generated titles short", () => {
    expect(
      sanitizeGeneratedChatTitle(
        "Build a product discovery canvas for onboarding and activation",
      ),
    ).toBe("Build a product");
  });

  it("strips wrapper noise from model output", () => {
    expect(sanitizeGeneratedChatTitle('"Title: Support Triage Ideas."')).toBe(
      "Support Triage Ideas",
    );
  });

  it("strips markdown emphasis from model output", () => {
    expect(sanitizeGeneratedChatTitle("**Support Triage Ideas**")).toBe(
      "Support Triage Ideas",
    );
    expect(sanitizeGeneratedChatTitle("### **Support Triage Ideas**")).toBe(
      "Support Triage Ideas",
    );
  });

  it("strips display noise without truncating existing titles", () => {
    expect(
      stripChatTitlePresentationNoise(
        "**Build a checklist for unusual wire transfer review**",
      ),
    ).toBe("Build a checklist for unusual wire transfer review");
  });
});
