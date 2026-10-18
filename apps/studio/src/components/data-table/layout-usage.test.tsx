// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const { feature } = vi.hoisted(() => ({ feature: vi.fn() }));
vi.mock("@/usage/client", () => ({ studioFeature: feature }));

import { DataTableProvider, useDataTable } from "./data-table-context";

it("records layout actions once per explicit interaction, excluding column names and saved layouts", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  function Controls() {
    const table = useDataTable();
    return (
      <button
        type="button"
        onClick={() => {
          table.toggleColumnVisibility("private-column");
          table.showAllColumns();
          table.pinColumn("private-column", "left");
          table.unpinColumn("private-column");
          table.resetColumnWidth("private-column");
          table.moveColumn("private-column", "other");
          table.applyLayout({ hidden: ["private-column"] });
          table.resetLayout();
        }}
      >
        Arrange
      </button>
    );
  }
  try {
    await act(async () =>
      root.render(
        <StrictMode>
          <DataTableProvider
            columns={[
              {
                key: "private-column",
                label: "private-label",
                defaultWidth: 100,
                filter: false,
                render: () => null,
              },
              {
                key: "other",
                label: "Other",
                defaultWidth: 100,
                filter: false,
                render: () => null,
              },
            ]}
          >
            <Controls />
          </DataTableProvider>
        </StrictMode>,
      ),
    );
    expect(feature).not.toHaveBeenCalled();
    await act(async () => container.querySelector("button")?.click());
    expect(feature.mock.calls.map(([, facts]) => facts.layout_action)).toEqual([
      "visibility",
      "show_all",
      "pin",
      "unpin",
      "reset_width",
      "reorder",
      "apply",
      "reset",
    ]);
    expect(
      feature.mock.calls.every(
        ([operation]) => operation === "studio.table.layout",
      ),
    ).toBe(true);
    expect(JSON.stringify(feature.mock.calls)).not.toContain("private");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
