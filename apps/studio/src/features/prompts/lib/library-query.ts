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
    limit: ["10", "20", "50", "100"].includes(value("pageSize", "20"))
      ? value("pageSize", "20")
      : "20",
    archived: value("archived", "false"),
    ...(value("tableFilters", "")
      ? { tableFilters: value("tableFilters", "") }
      : {}),
    ...(categoryId ? { categoryId } : {}),
  }).toString();
}
