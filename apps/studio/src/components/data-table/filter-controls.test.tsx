// @vitest-environment jsdom
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DataTableProvider } from "./data-table-context";
import { DataTableFilterControls } from "./data-table-filters";
import type { DataTableColumn, DataTableFilter } from "./types";
import { useTableScope } from "./use-table-scope";

vi.mock("@/usage/client", () => ({ studioFeature: vi.fn() }));
vi.mock("./use-filter-values", () => ({
  useFilterValues: () => ({ values: [], unavailable: false }),
}));
vi.mock("./data-table-columns-menu", () => ({
  DataTableColumnsMenu: () => null,
}));
// Keep this test about shared state and definitions; Radix interaction is checked manually.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect: () => void;
  }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}));
const fields: DataTableFilter<{ score: number }>[] = [
  {
    key: "score",
    label: "Confidence",
    kind: "number",
    read: (row) => row.score,
  },
];
const columns: DataTableColumn<{ score: number }>[] = [
  {
    key: "score",
    label: "Score",
    defaultWidth: 100,
    filter: fields[0],
    render: () => null,
  },
];
const apply = vi.fn(),
  search = vi.fn(),
  sort = vi.fn(),
  pageSize = vi.fn();
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
function Controls() {
  const scope = useTableScope(
    [{ kind: "boolean", key: "includeArchived", label: "Include archived" }],
    false,
  );
  return (
    <DataTableFilterControls
      tableId="definitions"
      searching={{
        value: "current search",
        onChange: search,
        label: "Search",
        placeholder: "Search…",
      }}
      panelContainer={container}
      fields={fields}
      data={[{ score: 1 }]}
      state={{
        filters: { match: "all", rules: [] },
        invalid: false,
        filterKey: "tableFilters.definitions",
        open: true,
        setOpen: vi.fn(),
        apply,
        matches: () => true,
      }}
      scopeFields={[
        { kind: "boolean", key: "includeArchived", label: "Include archived" },
      ]}
      scopeState={scope}
      clearQuery={vi.fn()}
      sort="score"
      direction="asc"
      onSetSortDirection={sort}
      pagination={{
        pageSize: 20,
        onPageSizeChange: pageSize,
        onCursorChange: vi.fn(),
      }}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  localStorage.clear();
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(() =>
    root.render(
      <NuqsTestingAdapter hasMemory>
        <DataTableProvider columns={columns}>
          <Controls />
        </DataTableProvider>
      </NuqsTestingAdapter>,
    ),
  );
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === text,
  );
  expect(button).toBeDefined();
  await act(() => button?.click());
}
it("builds numeric and scope controls from definitions, and clears conditions without clearing search", async () => {
  await render();
  expect(
    container.querySelector('[aria-label="Confidence minimum"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('[aria-label="Confidence maximum"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('aside input[type="checkbox"]')?.parentElement
      ?.textContent,
  ).toBe("Include archived");
  await click("Clear filters");
  expect(apply).toHaveBeenCalledWith({ match: "all", rules: [] });
  expect(search).not.toHaveBeenCalled();
});
it("restores search, sorting and page size from the shared saved-view contract", async () => {
  localStorage.setItem(
    "kortyx.table.definitions.views.v1",
    JSON.stringify([
      {
        name: "Saved state",
        filters: {
          match: "any",
          rules: [{ field: "score", operator: "gte", values: [0] }],
        },
        layout: {
          widths: { score: 160 },
          order: ["score"],
          hidden: [],
          pinned: {},
        },
        scope: { q: "saved search", includeArchived: "true" },
        sort: "score",
        direction: "desc",
        pageSize: 50,
      },
    ]),
  );
  await render();
  await click("Saved state");
  expect(search).toHaveBeenCalledWith("saved search");
  expect(sort).toHaveBeenCalledWith("score", "desc");
  expect(pageSize).toHaveBeenCalledWith(50);
  expect(apply).toHaveBeenCalledWith({
    match: "any",
    rules: [{ field: "score", operator: "gte", values: [0] }],
  });
});
