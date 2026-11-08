import "server-only";

/** Read canonical routes, with a compatibility path for the preceding API release. */
export async function fetchEvalApi(
  origin: string,
  path: string,
  init: RequestInit,
) {
  const base = `${origin.replace(/\/$/, "")}/v1/studio`;
  const legacy = `/evals/${path}`;
  // The legacy write handler is available on both API versions. Send one
  // request so rolling upgrades never require retrying a launch or cancellation.
  if (init.method === "POST") return fetch(`${base}${legacy}`, init);

  const [resource, ...rest] = path.split(/(?=[/?])/);
  const suffix = rest.join("");
  const canonical =
    resource === "targets"
      ? `/datasets${suffix}`
      : resource === "evaluations"
        ? `/experiments${suffix}`
        : resource === "runs" || resource === "capabilities"
          ? `/experiments/${path}`
          : legacy;
  const response = await fetch(`${base}${canonical}`, init);
  // Hono's route miss is plain text. Real API resource misses are JSON.
  if (
    canonical !== legacy &&
    response.status === 404 &&
    response.headers.get("content-type")?.startsWith("text/plain") &&
    (await response.clone().text()) === "404 Not Found"
  )
    return fetch(`${base}${legacy}`, init);
  return response;
}
