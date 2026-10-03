export async function evalRequest(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const response = await fetch(`/api/studio/evals/${path}`, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json", "x-kortyx-eval": "1" },
          body: JSON.stringify(body),
        }),
    cache: "no-store",
    signal,
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Eval request failed.");
  return json;
}
