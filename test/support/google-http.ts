/** Deterministic provider HTTP responses; SDK/hooks/workflows remain real. */
export function googleResponse(text: string, stream = true): Response {
  const payload = {
    candidates: [
      { content: { role: "model", parts: [{ text }] }, finishReason: "STOP" },
    ],
    usageMetadata: {
      promptTokenCount: 2,
      candidatesTokenCount: 3,
      totalTokenCount: 5,
    },
  };
  return new Response(
    stream ? `data: ${JSON.stringify(payload)}\n\n` : JSON.stringify(payload),
    {
      headers: {
        "content-type": stream ? "text/event-stream" : "application/json",
      },
    },
  );
}

export function providerFailure(status: number): Response {
  return new Response(
    JSON.stringify({ error: { message: "DO_NOT_EXPORT_PROVIDER_SECRET" } }),
    {
      status,
      headers: { "retry-after": "2", "content-type": "application/json" },
    },
  );
}
