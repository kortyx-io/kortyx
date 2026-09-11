import { describe, expect, it } from "vitest";
import { ChatStreamAccumulator, readSseEvents } from "../src/transport";

const read = async (response: Response) => {
  const values = [];
  for await (const value of readSseEvents(response)) values.push(value);
  return values;
};
describe("provider SSE transport", () => {
  it("handles byte-split UTF-8, CRLF, multiline data and the final event", async () => {
    const bytes = new TextEncoder().encode(
      ": ping\r\ndata: é\r\ndata: second\r\n\r\ndata: final",
    );
    const body = new ReadableStream({
      start(c) {
        for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
        c.close();
      },
    });
    expect(await read(new Response(body))).toEqual(["é\nsecond", "final"]);
    expect(body.locked).toBe(false);
  });
  it("releases a reader even if cancellation rejects", async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("data: first\n\n"));
      },
      cancel() {
        throw new Error("closed");
      },
    });
    for await (const value of readSseEvents(new Response(body))) {
      expect(value).toBe("first");
      break;
    }
    expect(body.locked).toBe(false);
  });
  it("rejects missing bodies and propagates read errors", async () => {
    await expect(read(new Response(null))).rejects.toThrow("empty");
    const body = new ReadableStream({
      start(c) {
        c.error(new Error("network failed"));
      },
    });
    await expect(read(new Response(body))).rejects.toThrow("network failed");
    expect(body.locked).toBe(false);
  });
});
describe("Chat Completions stream assembly", () => {
  it("retains reasoning, content, parallel tool fragments and trailing usage", () => {
    const stream = new ChatStreamAccumulator();
    stream.add({
      id: "response",
      choices: [
        {
          delta: {
            content: "A",
            reasoning_content: "thought",
            tool_calls: [
              {
                index: 1,
                id: "b",
                function: { name: "loo", arguments: '{"key":' },
              },
              {
                index: 0,
                id: "a",
                function: { name: "lookup", arguments: "{}" },
              },
            ],
          },
        },
      ],
    });
    stream.add({
      choices: [
        {
          delta: {
            content: "A",
            tool_calls: [
              { index: 1, function: { name: "kup", arguments: '"b"}' } },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });
    stream.add({
      id: null,
      choices: [],
      x_groq: { usage: { total_tokens: 12 } },
    });
    expect(stream.finish()).toMatchObject({
      id: "response",
      usage: { total_tokens: 12 },
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "AA",
            reasoning_content: "thought",
            tool_calls: [
              { id: "a" },
              {
                id: "b",
                function: { name: "lookup", arguments: '{"key":"b"}' },
              },
            ],
          },
        },
      ],
    });
  });
  it("preserves Mistral native thinking content and empty argument objects", () => {
    const stream = new ChatStreamAccumulator();
    const thinking = {
      type: "thinking",
      thinking: [{ type: "text", text: "reason" }],
    };
    stream.add(null);
    stream.add({
      choices: [
        {
          delta: {
            content: [thinking, { type: "text", text: "ok" }],
            tool_calls: [{ index: 0, id: "a", function: { name: "lookup" } }],
          },
          finish_reason: "tool_calls",
        },
      ],
    });
    expect(stream.finish()).toMatchObject({
      choices: [
        { message: { content: [thinking, { type: "text", text: "ok" }] } },
      ],
    });
  });
  it("requires a terminal reason even when the stream has text", () => {
    const stream = new ChatStreamAccumulator();
    stream.add({ choices: [{ delta: { content: "partial" } }] });
    expect(() => stream.finish()).toThrow("terminal");
  });
  it.each([
    { function: {} },
    { index: -1 },
    { index: 1.2 },
  ])("rejects invalid tool positions %j", (call) => {
    const stream = new ChatStreamAccumulator();
    expect(() =>
      stream.add({ choices: [{ delta: { tool_calls: [call] } }] }),
    ).toThrow("index");
  });
  it.each([
    { id: "", function: { name: "lookup" } },
    { id: "a", function: { name: "" } },
    { id: "a", function: { name: "lookup", arguments: "{" } },
  ])("rejects incomplete tool calls %j", (call) => {
    const stream = new ChatStreamAccumulator();
    stream.add({
      choices: [
        {
          delta: { tool_calls: [{ index: 0, ...call }] },
          finish_reason: "tool_calls",
        },
      ],
    });
    expect(() => stream.finish()).toThrow();
  });
  it("propagates explicit provider errors", () => {
    expect(() =>
      new ChatStreamAccumulator().add({ error: { message: "overloaded" } }),
    ).toThrow("overloaded");
    expect(() => new ChatStreamAccumulator().add({ error: true })).toThrow(
      "failed",
    );
  });
});
