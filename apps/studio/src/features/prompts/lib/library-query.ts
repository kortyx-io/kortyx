export type PromptLibrarySearch = Record<string, string | string[] | undefined>;

/** One canonical query for both the server snapshot and its client cache key. */
export function promptLibraryQuery(
  input: Record<string, string | string[] | number | undefined> = {},
  categoryId?: string,
) {
  const value = (key: string, fallback: string) => {
    const candidate = input[key];
    if (typeof candidate === "string") return candidate;
    // Client pagination uses the same numeric parsers as the shared table;
    // server search params arrive as strings. Both must produce the same key.
    if (typeof candidate === "number" && Number.isFinite(candidate))
      return String(candidate);
    return fallback;
  };
  return new URLSearchParams({
    search: value("q", ""),
    cursor: value("cursor", "0"),
    limit: ["10", "20", "50", "100"].includes(value("pageSize", "20"))
      ? value("pageSize", "20")
      : "20",
    archived: value("archived", "false"),
    sort: value("sort", "name"),
    dir: value("dir", "asc"),
    ...(value("tableFilters", "")
      ? { tableFilters: value("tableFilters", "") }
      : {}),
    ...(categoryId ? { categoryId } : {}),
  }).toString();
}
