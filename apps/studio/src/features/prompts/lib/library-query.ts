export type PromptLibrarySearch = Record<string, string | string[] | undefined>;

/** One canonical query for both the server snapshot and its client cache key. */
export function promptLibraryQuery(
  input: PromptLibrarySearch = {},
  categoryId?: string,
) {
  const value = (key: string, fallback: string) =>
    typeof input[key] === "string" ? (input[key] as string) : fallback;
  return new URLSearchParams({
    search: value("q", ""),
    cursor: value("cursor", "0"),
    archived: value("archived", "false"),
    ...(categoryId ? { categoryId } : {}),
  }).toString();
}
