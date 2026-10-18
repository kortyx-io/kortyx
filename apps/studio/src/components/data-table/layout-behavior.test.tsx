// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type DataTableContextValue,
  DataTableProvider,
  useDataTable,
} from "./data-table-context";
import type { DataTableColumn, DataTableLayout } from "./types";

vi.mock("@/usage/client", () => ({ studioFeature: vi.fn() }));
const columns: DataTableColumn<unknown>[] = ["a", "b", "c", "d"].map((key) => ({
  key,
  label: key,
  defaultWidth: 100,
  filter: false,
  render: () => null,
}));
let table: DataTableContextValue;
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
function Controls() {
  table = useDataTable();
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});
const render = (initialLayout = {}) =>
  act(() =>
    root.render(
      <DataTableProvider
        columns={columns}
        persistKey="layout-test"
        initialLayout={initialLayout}
      >
        <Controls />
      </DataTableProvider>,
    ),
  );
it("moves a sole pinned column out of its group and keeps hidden columns in their ordered positions", async () => {
  await render({
    order: ["d", "b", "a", "c"],
    hidden: ["b"],
    pinned: { a: "left", d: "right" },
  });
  expect(table.orderedColumnKeys).toEqual(["a", "b", "c", "d"]);
  expect(table.visibleColumnOrder).toEqual(["a", "c", "d"]);
  expect(table.isColumnDraggable("a")).toBe(true);
  await act(() => table.moveColumn("a", "c"));
  expect(table.pinned.a).toBeUndefined();
  expect(table.orderedColumnKeys).toEqual(["b", "c", "a", "d"]);
  expect(table.visibleColumnOrder).toEqual(["c", "a", "d"]);
  await act(() => table.toggleColumnVisibility("b"));
  expect(table.visibleColumnOrder).toEqual(["b", "c", "a", "d"]);
  expect(JSON.parse(localStorage.getItem("layout-test") ?? "{}").order).toEqual(
    ["b", "c", "a", "d"],
  );
});
it("adopts the target pin group and ignores unknown drag targets", async () => {
  await render({ pinned: { d: "right" } });
  await act(() => table.moveColumn("b", "d"));
  expect(table.pinned.b).toBe("right");
  expect(table.visibleColumnOrder).toEqual(["a", "c", "d", "b"]);
  await act(() => table.moveColumn("missing", "a"));
  expect(table.visibleColumnOrder).toEqual(["a", "c", "d", "b"]);
});
it("restores the latest shared layout in preference to a legacy seed", async () => {
  localStorage.setItem(
    "layout-test",
    JSON.stringify({
      order: ["d", "c", "b", "a"],
      hidden: ["b"],
      widths: { d: 225 },
      pinned: { d: "left" },
    }),
  );
  await render({ order: ["a", "b", "c", "d"] });
  expect(table.visibleColumnOrder).toEqual(["d", "c", "a"]);
  expect(table.storedWidths.d).toBe(225);
  await act(() => table.resetLayout());
  expect(table.visibleColumnOrder).toEqual(["a", "b", "c", "d"]);
  expect(table.hidden).toEqual([]);
  expect(table.pinned).toEqual({});
});
it("hydrates an external layout without treating it as a user edit", async () => {
  const changed = vi.fn();
  const preferenceLayout = {
    widths: { a: 150 },
    order: ["d", "c", "b", "a"],
    hidden: ["b"],
    pinned: {},
  };
  function HydratedTable() {
    const [restored, setRestored] = useState<DataTableLayout>();
    useEffect(() => {
      setRestored(preferenceLayout);
    }, []);
    return (
      <DataTableProvider
        columns={columns}
        initialLayout={{ hidden: ["c"] }}
        preferenceLayout={restored}
        onLayoutChange={changed}
      >
        <Controls />
      </DataTableProvider>
    );
  }
  await act(() => root.render(<HydratedTable />));
  expect(table.visibleColumnOrder).toEqual(["d", "c", "a"]);
  expect(changed).not.toHaveBeenCalled();
  await act(() => table.toggleColumnVisibility("b"));
  expect(changed).toHaveBeenCalledTimes(1);
});
