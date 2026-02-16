import type { StreamChunk } from "@kortyx/stream";
import { contentToText } from "@kortyx/utils";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";

interface TransformOptions {
  debug?: boolean;
  visibleNodes?: string[];
  forwardModelStream?: boolean; // if true, forward on_chat_model_stream as text-delta
  emitStatus?: boolean;
}

/**
 * Transforms LangGraph's astream_events into standardized UI chunks.
 * Now supports layered state model:
 *   - `ui.message`
 *   - `ui.structured`
 *   - fallback to legacy `output` and `payload`
 */
export async function* transformGraphStreamForUI(
  stream: AsyncIterable<StreamEvent>,
  options: TransformOptions = {},
): AsyncGenerator<StreamChunk> {
  const {
    debug = false,
    forwardModelStream = false,
    emitStatus = debug,
  } = options;
  let currentNode: string | null = null;
  const streamedTextByNode = new Map<string, boolean>();
  const startedNodes = new Set<string>();
  const endedNodes = new Set<string>();
  let sawInterrupt = false;

  function findChoiceSchema(obj: any): {
    kind: string;
    multiple?: boolean;
    question?: string;
    options?: any[];
  } | null {
    try {
      if (!obj || typeof obj !== "object") return null;
      if (
        typeof obj.kind === "string" &&
        (obj.kind === "choice" || obj.kind === "multi-choice") &&
        Array.isArray(obj.options)
      ) {
        return obj as any;
      }
      for (const v of Object.values(obj)) {
        const inner = findChoiceSchema(v);
        if (inner) return inner;
      }
    } catch {}
    return null;
  }

  for await (const event of stream) {
    const { event: type, name, data } = event ?? {};
    if (debug) console.log(`[debug:event]`, JSON.stringify(event, null, 2));

    switch (type) {
      case "on_chain_start":
        if (name && !name.startsWith("ChannelWrite")) {
          currentNode = name;
          if (name === "__start__" || name === "__end__") break;
          if (startedNodes.has(name)) break; // de-dupe
          startedNodes.add(name);
          if (debug) console.log(`[debug:start] node=${name}`);
          if (emitStatus) {
            yield { type: "status", message: `Processing node: ${name}` };
          }
        }
        break;

      case "on_graph_interrupt": {
        // LangGraph dynamic interrupt hit (via interrupt()).
        // Try to surface an interrupt chunk if the payload looks like a choice schema.
        sawInterrupt = true;
        if (debug)
          console.log(
            `[debug:on_graph_interrupt]`,
            JSON.stringify({ name, data }, null, 2),
          );
        const where =
          (typeof name === "string" && name) ||
          (data as any)?.node ||
          "unknown";
        const schema = findChoiceSchema(data as any);
        if (schema) {
          const isText = schema.kind === "text";
          const options = Array.isArray(schema.options)
            ? schema.options
                .map((o: any) => ({
                  id: String(o.id ?? ""),
                  label: String(o.label ?? ""),
                  ...(o.description
                    ? { description: String(o.description) }
                    : {}),
                }))
                .filter((o: any) => o.id && o.label)
            : [];

          yield {
            type: "interrupt",
            // Tokens will be injected by orchestrator when it sees this placeholder
            requestId: "",
            resumeToken: "",
            node: typeof where === "string" ? where : undefined,
            input: {
              kind: schema.kind as any,
              multiple: Boolean(schema.multiple),
              ...(isText
                ? { question: schema.question } // Optional for text
                : {
                    question:
                      typeof schema.question === "string"
                        ? schema.question
                        : "Please choose",
                  }), // Required for choice
              ...(options.length > 0 ? { options } : {}),
            },
          } as any;
        } else if (emitStatus) {
          yield { type: "status", message: `⏸️ Interrupted at: ${where}` };
        }
        break;
      }

      case "on_chat_model_stream":
        // By default, DO NOT forward raw model tokens to UI.
        // We only surface messages explicitly published via ctx.emit("message", ...).
        if (forwardModelStream && data?.chunk?.content) {
          if (currentNode && !streamedTextByNode.get(currentNode)) {
            yield { type: "text-start", node: currentNode };
            streamedTextByNode.set(currentNode, true);
          }
          const delta = contentToText(data.chunk.content);
          if (delta) {
            yield {
              type: "text-delta",
              delta,
              node: currentNode ?? "ai",
            };
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

        // 🔹 Unified message extraction (new + legacy)
        // No direct message emission here; handled via orchestrator 'message' event.

        // Structured data and transitions are emitted via ctx.emit in create-langgraph

        // If this node streamed tokens earlier, close the stream with text-end
        if (nodeName && streamedTextByNode.get(nodeName)) {
          yield { type: "text-end", node: nodeName };
          streamedTextByNode.delete(nodeName);
        }

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

        currentNode = null;
        break;
      }

      case "on_graph_end": {
        if (debug)
          console.log(`[debug:on_graph_end]`, JSON.stringify(data, null, 2));
        const out = (data as any)?.output ?? null;
        // If graph ended due to dynamic interrupt, output contains __interrupt__
        const interrupts = out && (out.__interrupt__ as any);
        if (interrupts && Array.isArray(interrupts) && interrupts.length > 0) {
          const first = interrupts[0];
          const val = first?.value ?? first; // support value nesting
          const schema = findChoiceSchema(val);
          if (schema && Array.isArray(schema.options)) {
            const isText = schema.kind === "text";
            const options = Array.isArray(schema.options)
              ? schema.options
                  .map((o: any) => ({
                    id: String(o.id ?? ""),
                    label: String(o.label ?? ""),
                    ...(o.description
                      ? { description: String(o.description) }
                      : {}),
                  }))
                  .filter((o: any) => o.id && o.label)
              : [];

            yield {
              type: "interrupt",
              requestId: "",
              resumeToken: "",
              input: {
                kind: schema.kind as any,
                multiple: Boolean(schema.multiple),
                ...(isText
                  ? { question: schema.question } // Optional for text
                  : {
                      question:
                        typeof schema.question === "string"
                          ? schema.question
                          : "Please choose",
                    }), // Required for choice
                ...(options.length > 0 ? { options } : {}),
              },
            } as any;
          } else if (emitStatus) {
            yield { type: "status", message: "⏸️ Interrupt received" };
          }
        }
        if (sawInterrupt && debug && emitStatus)
          yield { type: "status", message: "🔚 Graph ended after interrupt" };
        yield { type: "done", data: out };
        break;
      }

      default:
        // Surface any interrupt-like event names for debugging visibility
        if (typeof type === "string" && type.includes("interrupt")) {
          sawInterrupt = true;
          if (debug)
            console.log(
              `[debug:interrupt_like]`,
              JSON.stringify({ type, name, data }, null, 2),
            );
          if (emitStatus) {
            yield {
              type: "status",
              message: `⏸️ Interrupt event: ${type} ${name ?? ""}`.trim(),
            };
          }
        } else if (debug) {
          console.warn(`[debug:unknown_event]`, type);
        }
        break;
    }
  }
}
