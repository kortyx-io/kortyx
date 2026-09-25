/** Match display names regardless of separators or camel-case spelling. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

export function matchesSearchText(
  query: string,
  values: Array<string | null | undefined>,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  return (
    !normalizedQuery ||
    values.some((value) =>
      value ? normalizeSearchText(value).includes(normalizedQuery) : false,
    )
  );
}
