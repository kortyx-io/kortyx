import { describe, expect, it } from "vitest";
import type { ChatHistoryMessage } from "@/lib/runtime-context";
import {
  formatHistoryVerbatim,
  serializeHistoryForPrompt,
} from "./serialize-history";

const history: ChatHistoryMessage[] = [
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi   there\nfriend" },
  { role: "user", content: "Update the intro" },
];

describe("serializeHistoryForPrompt", () => {
  it("returns the no-history sentinel for empty input", () => {
    expect(serializeHistoryForPrompt([])).toBe("(no prior turns)");
  });

  it("renders one `role: content` line per message", () => {
    expect(serializeHistoryForPrompt(history)).toBe(
      "user: Hello\nassistant: Hi there friend\nuser: Update the intro",
    );
  });

  it("collapses whitespace inside messages", () => {
    const out = serializeHistoryForPrompt([
      { role: "user", content: "a\n\nb   c" },
    ]);
    expect(out).toBe("user: a b c");
  });

  it("caps to the last `limit` messages", () => {
    const long: ChatHistoryMessage[] = Array.from({ length: 12 }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }));
    const out = serializeHistoryForPrompt(long, 3);
    expect(out).toBe("user: msg 9\nuser: msg 10\nuser: msg 11");
  });
});

describe("formatHistoryVerbatim", () => {
  it("preserves the raw content including newlines", () => {
    expect(formatHistoryVerbatim(history)).toBe(
      "user: Hello\nassistant: Hi   there\nfriend\nuser: Update the intro",
    );
  });
});
