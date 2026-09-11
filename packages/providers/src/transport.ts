const extractSseData = (eventBlock: string): string | undefined => {
  const lines = eventBlock.split("\n");
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return undefined;
  return dataLines.join("\n");
};

export async function* readSseEvents(
  response: Response,
): AsyncGenerator<string> {
  const body = response.body;
  if (!body) {
    throw new Error("response body is empty.");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer = (buffer + decoder.decode(value, { stream: true })).replaceAll(
        "\r\n",
        "\n",
      );

      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const data = extractSseData(block);
        if (data) yield data;
        split = buffer.indexOf("\n\n");
      }
    }

    buffer += decoder.decode().replaceAll("\r\n", "\n");
    const data = extractSseData(buffer);
    if (data) yield data;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Assemble the common Chat Completions wire format, including trailing usage. */
export class ChatStreamAccumulator {
  private envelope: Record<string, unknown> = {};
  private content: unknown[] = [];
  private reasoning = "";
  private finishReason: string | undefined;
  private calls = new Map<
    number,
    {
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }
  >();

  add(value: unknown): void {
    const chunk = record(value);
    if (chunk.error)
      throw new Error(
        String(record(chunk.error).message ?? "Provider stream failed."),
      );
    const { choices, ...metadata } = chunk;
    for (const [key, entry] of Object.entries(metadata)) {
      if (entry != null) this.envelope[key] = entry;
    }
    const choice = record(Array.isArray(choices) ? choices[0] : undefined);
    if (typeof choice.finish_reason === "string")
      this.finishReason = choice.finish_reason;
    const delta = record(choice.delta);
    if (typeof delta.content === "string")
      this.content.push({ type: "text", text: delta.content });
    else if (Array.isArray(delta.content)) this.content.push(...delta.content);
    if (typeof delta.reasoning_content === "string")
      this.reasoning += delta.reasoning_content;
    for (const raw of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
      const call = record(raw);
      if (!Number.isInteger(call.index) || Number(call.index) < 0)
        throw new Error("Streamed tool call is missing its index.");
      const index = Number(call.index);
      const state = this.calls.get(index) ?? {
        id: "",
        type: "function" as const,
        function: { name: "", arguments: "" },
      };
      if (typeof call.id === "string") state.id = call.id;
      const fn = record(call.function);
      if (typeof fn.name === "string") state.function.name += fn.name;
      if (typeof fn.arguments === "string")
        state.function.arguments += fn.arguments;
      this.calls.set(index, state);
    }
  }

  finish(): unknown {
    if (!this.finishReason)
      throw new Error(
        "Provider stream ended without a terminal finish reason.",
      );
    const calls = [...this.calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, call]) => {
        if (!call.id || !call.function.name)
          throw new Error("Incomplete streamed tool call.");
        JSON.parse(call.function.arguments || "{}");
        return call;
      });
    const hasThinking = this.content.some(
      (part) => record(part).type !== "text",
    );
    return {
      ...this.envelope,
      usage: record(this.envelope.x_groq).usage ?? this.envelope.usage,
      choices: [
        {
          finish_reason: this.finishReason,
          message: {
            role: "assistant",
            content: hasThinking
              ? this.content
              : this.content.map((part) => record(part).text ?? "").join(""),
            ...(this.reasoning ? { reasoning_content: this.reasoning } : {}),
            ...(calls.length ? { tool_calls: calls } : {}),
          },
        },
      ],
    };
  }
}
