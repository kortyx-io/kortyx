import {
  type StudioRelease,
  StudioReleaseSchema,
} from "@kortyx/telemetry-contracts";

export const STUDIO_RELEASE_URL =
  "https://updates.kortyx.io/studio/stable.json";

export class ReleaseCheckError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}

// Published last, after smoke tests and both production images are promoted.
export async function latestStudioRelease(
  fetcher: typeof fetch = fetch,
): Promise<StudioRelease | null> {
  const response = await fetcher(STUDIO_RELEASE_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Kortyx-Studio-Updater",
    },
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const delay = retry
      ? /^\d+$/.test(retry)
        ? Number(retry) * 1000
        : Date.parse(retry) - Date.now()
      : 0;
    throw new ReleaseCheckError(
      `Release check failed (HTTP ${response.status}). Try again later.`,
      Number.isFinite(delay)
        ? Math.min(7 * 24 * 60 * 60_000, Math.max(0, delay))
        : 0,
    );
  }
  // Bound the body even if a proxy sends HTML or an incorrect Content-Length.
  const reader = response.body?.getReader();
  if (!reader) throw new ReleaseCheckError("Empty release information.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_384)
        throw new ReleaseCheckError("Release information is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return StudioReleaseSchema.parse(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
}
