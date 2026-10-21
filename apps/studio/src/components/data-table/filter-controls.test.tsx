// @vitest-environment jsdom

import type { TableFilters } from "@kortyx/telemetry-contracts";
import { emptyTablePreferences } from "@kortyx/telemetry-contracts";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DataTableProvider } from "./data-table-context";
import { DataTableFilterControls } from "./data-table-filters";
import {
  CurrentTablePreference,
  type TablePreferenceEntry,
  type TablePreferenceSnapshot,
} from "./table-persistence";
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
    <div data-views-menu>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect: (event: { preventDefault: () => void }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSelect({ preventDefault: () => {} })}
    >
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
let currentFilters: TableFilters;
function Controls({ disabled = false }: { disabled?: boolean }) {
  const scope = useTableScope(
    [{ kind: "boolean", key: "includeArchived", label: "Include archived" }],
    false,
  );
  return (
    <DataTableFilterControls
      disabled={disabled}
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
        filters: currentFilters,
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
  currentFilters = { match: "all", rules: [] };
  localStorage.clear();
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render(disabled = false) {
  await act(() =>
    root.render(
      <NuqsTestingAdapter hasMemory>
        <DataTableProvider columns={columns}>
          <Controls disabled={disabled} />
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

async function fillBound(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(
    `[aria-label="${name}"]`,
  );
  if (!input) throw new Error(`Missing ${name}`);
  await act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("keeps newer invalid bounds when an older URL write returns, then applies a zero range", async () => {
  vi.useFakeTimers();
  await render();
  await fillBound("Confidence minimum", "1");
  await act(() => vi.advanceTimersByTime(350));
  expect(apply).toHaveBeenLastCalledWith({
    match: "all",
    rules: [{ field: "score", operator: "gte", values: [1] }],
  });
  await fillBound("Confidence maximum", "0");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "minimum must not exceed maximum",
  );
  currentFilters = apply.mock.lastCall?.[0];
  await render(); // Acknowledge the earlier minimum after the invalid edit.
  expect(
    container.querySelector<HTMLInputElement>(
      '[aria-label="Confidence maximum"]',
    )?.value,
  ).toBe("0");
  await fillBound("Confidence minimum", "0");
  await act(() => vi.advanceTimersByTime(350));
  expect(apply).toHaveBeenLastCalledWith({
    match: "all",
    rules: [{ field: "score", operator: "between", values: [0, 0] }],
  });
  currentFilters = { match: "all", rules: [] };
  await render(); // External reset/navigation remains authoritative.
  expect(
    container.querySelector<HTMLInputElement>(
      '[aria-label="Confidence minimum"]',
    )?.value,
  ).toBe("");
  expect(
    container.querySelector<HTMLInputElement>(
      '[aria-label="Confidence maximum"]',
    )?.value,
  ).toBe("");
});

it("disables loading search until the real table can retain input", async () => {
  await render(true);
  expect(
    container.querySelector<HTMLInputElement>('input[type="search"]')?.disabled,
  ).toBe(true);
  await render(false);
  expect(
    container.querySelector<HTMLInputElement>('input[type="search"]')?.disabled,
  ).toBe(false);
});

it.each([
  "error",
  "conflict",
] as const)("keeps %s recovery in Views and out of the table toolbar", async (status) => {
  const snapshot: TablePreferenceSnapshot = {
    preferences: emptyTablePreferences(),
    hydrated: true,
    status,
    error: "Changes are cached in this browser.",
  };
  const entry: TablePreferenceEntry = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    getServerSnapshot: () => snapshot,
    start: vi.fn(),
    mutate: vi.fn(),
    retry: vi.fn(),
    reload: vi.fn(),
    dispose: vi.fn(),
  };
  await act(() =>
    root.render(
      <NuqsTestingAdapter hasMemory>
        <DataTableProvider columns={columns}>
          <CurrentTablePreference.Provider value={entry}>
            <Controls />
          </CurrentTablePreference.Provider>
        </DataTableProvider>
      </NuqsTestingAdapter>,
    ),
  );
  const menu = container.querySelector(
    '[data-table-controls="definitions"] [data-views-menu]',
  );
  expect(menu?.textContent).toContain(snapshot.error);
  const alerts = container.querySelectorAll('[role="alert"]');
  expect(alerts).toHaveLength(1);
  expect(menu?.contains(alerts[0])).toBe(true);
  await click(status === "conflict" ? "Save my changes" : "Retry");
  expect(entry.retry).toHaveBeenCalledOnce();
  await click("Reload preferences");
  expect(entry.reload).toHaveBeenCalledOnce();
});
