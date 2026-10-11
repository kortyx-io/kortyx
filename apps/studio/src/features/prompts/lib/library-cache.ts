/** String keys let mutations refresh unmounted libraries via SWR's public cache API. */
export function promptLibraryCacheKey(scope: string, path: string) {
  return `prompt-library:${scope}:${path}`;
}

export function promptLibraryCacheEntries(
  keys: Iterable<string>,
  scope: string,
) {
  const prefix = promptLibraryCacheKey(scope, "");
  return Array.from(keys)
    .filter((key) => key.startsWith(prefix))
    .map((key) => ({ key, path: key.slice(prefix.length) }));
}
