// @vitest-environment jsdom
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DataTableColumn } from "./types";
import { tableQueryKeys, useTableQuery } from "./use-table-query";

vi.mock("@/lib/scoped-navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
const columns: DataTableColumn<{ id: string }, "name">[] = [
  {
    key: "id",
    label: "Name",
    sortKey: "name",
    defaultWidth: 100,
    filter: false,
    render: () => null,
  },
];
let query: ReturnType<typeof useTableQuery<{ id: string }, "name">>;
let root: ReturnType<typeof createRoot>;
const url = vi.fn();
function Controls() {
  query = useTableQuery("example", columns, {
    mode: "remote",
    defaults: { sort: "name" },
  });
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  url.mockClear();
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});
async function mount() {
  await act(() =>
    root.render(
      <NuqsTestingAdapter
        hasMemory
        resetUrlUpdateQueueOnMount={false}
        searchParams="?cursor=40"
        onUrlUpdate={url}
      >
        <Controls />
      </NuqsTestingAdapter>,
    ),
  );
}
it("resets pagination for search, sort and page-size changes and keeps cursor-only changes", async () => {
  await mount();
  await act(async () => {
    query.onSearch("query");
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  expect(query.q).toBe("query");
  expect(query.cursor).toBe(0);
  await act(async () => {
    await query.change({ cursor: 20 });
  });
  expect(query.cursor).toBe(20);
  await act(async () => {
    query.setSortDirection("name", "asc");
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  expect(query.dir).toBe("asc");
  expect(query.cursor).toBe(0);
  await act(async () => {
    await query.change({ pageSize: 50 });
  });
  expect(query.pageSize).toBe(50);
  expect(
    JSON.parse(localStorage.getItem("kortyx.table.example.query.v1") ?? "{}"),
  ).toEqual({ sort: "name", dir: "asc", pageSize: 50 });
});
it("namespaces embedded state while allowing existing URL keys to be configured", () => {
  expect(tableQueryKeys("child").q).toBe("tableSearch.child");
  expect(
    tableQueryKeys("child", {
      keys: { q: "childSearch", cursor: "childPage" },
    }),
  ).toMatchObject({
    q: "childSearch",
    cursor: "childPage",
    filters: "tableFilters.child",
  });
});

it("does not navigate when persisted preferences already match the mounted table", async () => {
  localStorage.setItem(
    "kortyx.table.example.query.v1",
    JSON.stringify({ sort: "name", dir: "desc", pageSize: 20 }),
  );
  await mount();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  expect(url).not.toHaveBeenCalled();
});

it("restores changed preferences once without resetting the current page", async () => {
  localStorage.setItem(
    "kortyx.table.example.query.v1",
    JSON.stringify({ sort: "name", dir: "asc", pageSize: 50 }),
  );
  await mount();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  expect(query).toMatchObject({ dir: "asc", pageSize: 50, cursor: 40 });
  expect(url).toHaveBeenCalledTimes(1);
  expect(url.mock.calls[0][0].options.history).toBe("replace");
});
