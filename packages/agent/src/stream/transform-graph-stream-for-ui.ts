import type { StreamChunk } from "@kortyx/stream";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";

interface TransformOptions {
  debug?: boolean;
  emitStatus?: boolean;
}

/**
 * Transforms LangGraph's astream_events into standardized UI chunks.
 * Runtime emits (`message`, `structured_data`, `interrupt`, `transition`) are
 * forwarded directly by the orchestrator, so this transformer only handles
 * graph lifecycle + completion signals.
 */
export async function* transformGraphStreamForUI(
  stream: AsyncIterable<StreamEvent>,
  options: TransformOptions = {},
): AsyncGenerator<StreamChunk> {
  const { debug = false, emitStatus = debug } = options;
  const startedNodes = new Set<string>();
  const endedNodes = new Set<string>();

  for await (const event of stream) {
    const { event: type, name, data } = event ?? {};
    if (debug) console.log(`[debug:event]`, JSON.stringify(event, null, 2));

    switch (type) {
      case "on_chain_start":
        if (name && !name.startsWith("ChannelWrite")) {
          if (name === "__start__" || name === "__end__") break;
          if (startedNodes.has(name)) break; // de-dupe
          startedNodes.add(name);
          if (debug) console.log(`[debug:start] node=${name}`);
          if (emitStatus) {
            yield { type: "status", message: `Processing node: ${name}` };
          }
        }
        break;

      case "on_chain_end": {
        const nodeName = name;
        const output = data?.output;
        if (debug)
          console.log(
            `[debug:on_chain_end:${nodeName}] output=`,
            JSON.stringify(output, null, 2),
          );
        if (!output || nodeName?.startsWith("ChannelWrite")) break;

        // Emit a simple completion status for UI progress feedback (de-dupe + skip internal nodes)
        if (nodeName !== "__start__" && nodeName !== "__end__") {
          if (!endedNodes.has(nodeName)) {
            if (emitStatus) {
              yield {
                type: "status",
                message: `✅ Completed node: ${nodeName}`,
              };
            }
            endedNodes.add(nodeName);
          }
        }
        break;
      }

      case "on_graph_end": {
        if (debug)
          console.log(`[debug:on_graph_end]`, JSON.stringify(data, null, 2));
        yield { type: "done", data: (data as any)?.output ?? null };
        break;
      }

      default:
        if (debug) {
          console.warn(`[debug:unknown_event]`, type);
        }
        break;
    }
  }
}
