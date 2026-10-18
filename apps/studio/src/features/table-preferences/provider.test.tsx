// @vitest-environment jsdom
import { act, useContext } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  TablePreferenceEntries,
  type TablePreferenceEntry,
} from "@/components/data-table/table-persistence";
import { TablePreferencesProvider } from "./provider";

it("keeps sample choices in a separate browser cache without remote requests", async () => {
  const cacheKey = "a".repeat(64);
  const realKey = `kortyx.table-cache.v1.${cacheKey}.runs`;
  localStorage.setItem(realKey, "real project state");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  const root = createRoot(container);
  let entry: TablePreferenceEntry | undefined;
  function Consumer() {
    entry = useContext(TablePreferenceEntries)?.("runs");
    return null;
  }
  try {
    await act(async () =>
      root.render(
        <TablePreferencesProvider localCacheNamespace="sample" remote>
          <Consumer />
        </TablePreferencesProvider>,
      ),
    );
    entry?.start();
    entry?.mutate({
      kind: "defaults",
      patch: { query: { sort: "started", dir: "desc", pageSize: 25 } },
    });
    expect(entry?.getSnapshot().status).toBe("local");
    expect(localStorage.getItem("kortyx.table-cache.v1.sample.runs")).toContain(
      '"pageSize":25',
    );
    expect(localStorage.getItem(realKey)).toBe("real project state");
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    entry?.dispose();
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});
