import type { StreamChunk } from "@kortyx/stream";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";
import { describe, expect, it, vi } from "vitest";
import { transformGraphStreamForUI } from "../src/stream/transform-graph-stream-for-ui";

async function* events(items: unknown[]) {
  for (const item of items) yield item;
}

const collect = async (
  items: unknown[],
  options: { debug?: boolean; emitStatus?: boolean } = {},
) => {
  const chunks: StreamChunk[] = [];
  for await (const chunk of transformGraphStreamForUI(
    events(items) as AsyncIterable<StreamEvent>,
    options,
  )) {
    chunks.push(chunk);
  }
  return chunks;
};

describe("transformGraphStreamForUI", () => {
  it("emits deduped node lifecycle status and graph completion", async () => {
    await expect(
      collect(
        [
          { event: "on_chain_start", name: "__start__" },
          { event: "on_chain_start", name: "ChannelWrite<messages>" },
          { event: "on_chain_start", name: "planner" },
          { event: "on_chain_start", name: "planner" },
          {
            event: "on_chain_end",
            name: "planner",
            data: { output: { ok: true } },
          },
          {
            event: "on_chain_end",
            name: "planner",
            data: { output: { ok: true } },
          },
          {
            event: "on_chain_end",
            name: "ChannelWrite<messages>",
            data: { output: {} },
          },
          { event: "on_chain_end", name: "__end__", data: { output: {} } },
          {
            event: "on_graph_end",
            data: { output: { currentWorkflow: "planner" } },
          },
        ],
        { emitStatus: true },
      ),
    ).resolves.toEqual([
      { type: "status", message: "Processing node: planner" },
      { type: "status", message: "✅ Completed node: planner" },
      { type: "done", data: { currentWorkflow: "planner" } },
    ]);
  });

  it("supports debug logging, disabled status, empty graph output, and unknown events", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      collect(
        [
          null,
          { event: "on_chain_start", name: "writer" },
          { event: "on_chain_end", name: "writer", data: {} },
          { event: "unknown_event" },
          { event: "on_graph_end", data: {} },
        ],
        { debug: true, emitStatus: false },
      ),
    ).resolves.toEqual([{ type: "done", data: null }]);

    expect(log).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[debug:unknown_event]", "unknown_event");

    log.mockRestore();
    warn.mockRestore();
  });

  it("falls back to the latest graph state when graph completion omits output", async () => {
    await expect(
      collect([
        {
          event: "on_chain_end",
          name: "draft",
          data: { output: { data: { local: true } } },
        },
        {
          event: "on_chain_end",
          name: "__end__",
          data: {
            output: {
              currentWorkflow: "checkpoint-lab",
              data: { completed: true },
            },
          },
        },
        { event: "on_graph_end", data: {} },
      ]),
    ).resolves.toEqual([
      {
        type: "done",
        data: {
          currentWorkflow: "checkpoint-lab",
          data: { completed: true },
        },
      },
    ]);
  });
});
