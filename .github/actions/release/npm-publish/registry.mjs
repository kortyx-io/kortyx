const registry = new URL(
  process.env.NPM_REGISTRY_URL || "https://registry.npmjs.org/",
);

export async function packageMetadata(name) {
  const url = new URL(encodeURIComponent(name), registry);
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.npm.install-v1+json",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `npm registry returned HTTP ${response.status} for ${name}`,
    );
  }
  return response.json();
}
