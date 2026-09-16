export type StudioDetailResource = "runs" | "sessions" | "interrupts";

/** Entity IDs are opaque data, including URL delimiters and literal escapes. */
export function studioDetailHref(
  resource: StudioDetailResource,
  id: string,
  selection: Record<string, string | undefined> = {},
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(selection)) {
    if (value !== undefined) query.set(key, value);
  }
  const search = query.toString();
  return `/${resource}/${encodeURIComponent(id)}${search ? `?${search}` : ""}`;
}

/** Next's detail route params carry encoded segment values in both route modes. */
export function studioRouteId(segment: string) {
  return decodeURIComponent(segment);
}
