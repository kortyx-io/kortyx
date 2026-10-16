import type { DocsSearchEntry } from "@/lib/docs";

// This module is only used by the client search dialog. Share an in-flight or
// completed load across dialog openings and client-side navigation in this tab.
let entriesPromise: Promise<DocsSearchEntry[]> | undefined;

export function loadDocsSearchEntries(): Promise<DocsSearchEntry[]> {
  entriesPromise ??= fetch("/api/docs-search")
    .then((response) => {
      if (!response.ok) throw new Error("Unable to load documentation search");
      return response.json() as Promise<DocsSearchEntry[]>;
    })
    .catch((error: unknown) => {
      entriesPromise = undefined;
      throw error;
    });
  return entriesPromise;
}
