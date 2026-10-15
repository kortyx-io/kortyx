// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DataTable } from "./data-table";
import { DataTableProvider } from "./data-table-context";

vi.mock("./data-table-filters", () => ({
  DataTableFilterControls: () => null,
}));

vi.mock("./use-table-filters", () => ({
  useTableFilters: () => ({ matches: () => true }),
}));
vi.mock("./use-table-search", () => ({
  useTableSearch: () => ({ value: "", managed: false }),
}));
vi.mock("./use-table-pagination", () => ({
  useTablePagination: () => ({
    cursor: 0,
    pageSize: 20,
    pageSizes: [10, 20, 50, 100],
    onCursorChange: vi.fn(),
    onPageSizeChange: vi.fn(),
  }),
}));

let root: Root;
let container: HTMLDivElement;
const openRow = vi.fn();
const openCell = vi.fn();

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  openRow.mockClear();
  openCell.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() =>
    root.render(
      <DataTableProvider
        columns={[
          {
            key: "name",
            filter: false,
            label: "Name",
            defaultWidth: 300,
            render: () => (
              <div>
                <span data-cell-text>Evaluation</span>
                <button type="button" onClick={openCell}>
                  <span data-cell-button>Open evaluation</span>
                </button>
                <a
                  href="/evals/runs/example"
                  onClick={(e) => e.preventDefault()}
                >
                  <span data-cell-link>Inspect result</span>
                </a>
                <label>
                  <input type="checkbox" /> Compare
                </label>
                <span data-cancelled>Cancelled action</span>
              </div>
            ),
          },
        ]}
      >
        <DataTable
          tableId="row-click-test"
          data={[{ id: "evaluation" }]}
          getRowKey={(row) => row.id}
          onRowClick={openRow}
        />
      </DataTableProvider>,
    ),
  );
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function click(selector: string, options: MouseEventInit = {}) {
  await act(() => {
    const target = container.querySelector(selector);
    if (!target) throw new Error(`Missing click target: ${selector}`);
    target.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        ...options,
      }),
    );
  });
}

it("opens the row once from non-interactive content and passes modifier keys", async () => {
  await click("[data-cell-text]", { ctrlKey: true });
  expect(openRow).toHaveBeenCalledTimes(1);
  expect(openRow.mock.calls[0][0]).toEqual({ id: "evaluation" });
  expect(openRow.mock.calls[0][1].ctrlKey).toBe(true);
});

it("opens a cell button once without also opening the row", async () => {
  await click("[data-cell-button]");
  expect(openCell).toHaveBeenCalledTimes(1);
  expect(openRow).not.toHaveBeenCalled();
});

it("keeps comparison selection on the table when clicking the checkbox label", async () => {
  await click("label");
  expect(container.querySelector<HTMLInputElement>("input")?.checked).toBe(
    true,
  );
  expect(openRow).not.toHaveBeenCalled();
});

it("leaves modified link clicks and cancelled actions to their own handlers", async () => {
  await click("[data-cell-link]", { metaKey: true });
  container
    .querySelector("[data-cancelled]")
    ?.addEventListener("click", (event) => event.preventDefault());
  await click("[data-cancelled]");
  expect(openRow).not.toHaveBeenCalled();
});
