// Loaded only by the isolated example E2E runner. Never enabled in application code.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const href = typeof url === "string" ? url : (url.url ?? String(url));
  if (!href.startsWith("https://generativelanguage.googleapis.com/"))
    return originalFetch(url, init);
  const body = JSON.parse(init?.body ?? "{}");
  const text = JSON.stringify(body.contents ?? []);
  const scenario =
    [...text.matchAll(/CASE:(ok|503|401|partial|slow)/g)].at(-1)?.[1] ?? "ok";
  if (scenario === "503" || scenario === "401")
    return new Response(
      JSON.stringify({ error: { message: "DO_NOT_EXPORT_PROVIDER_SECRET" } }),
      { status: Number(scenario), headers: { "retry-after": "2" } },
    );
  if (scenario === "slow")
    await new Promise((resolve, reject) => {
      if (init?.signal?.aborted) {
        reject(init.signal.reason);
        return;
      }
      const timer = setTimeout(resolve, 10000);
      init?.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(init.signal.reason);
        },
        { once: true },
      );
    });
  const isClassifier = JSON.stringify(body.systemInstruction ?? {}).includes(
    "You classify the user's latest message into exactly one intent.",
  );
  const content = isClassifier
    ? JSON.stringify({ intent: "general_chat" })
    : scenario === "partial"
      ? "Partial answer visible."
      : "Verified example response.";
  const payload = {
    candidates: [
      {
        content: { role: "model", parts: [{ text: content }] },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 2,
      candidatesTokenCount: 3,
      totalTokenCount: 5,
    },
  };
  if (href.includes("streamGenerateContent"))
    return new Response(
      `data: ${JSON.stringify(payload)}\n\n${scenario === "partial" && !isClassifier ? "data: broken-json\n\n" : ""}`,
      { headers: { "content-type": "text/event-stream" } },
    );
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  });
};
