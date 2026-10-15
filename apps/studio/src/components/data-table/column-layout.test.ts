import { expect, it } from "vitest";
import { columnLayout } from "./column-layout";
import type { DataTableColumn } from "./types";

const columns: DataTableColumn<unknown>[] = [
  "name",
  "status",
  "new-detail",
].map((key) => ({
  key,
  label: key,
  defaultWidth: 100,
  filter: false,
  render: () => null,
}));
it("keeps saved ordering and visibility when new columns arrive", () => {
  expect(
    columnLayout(columns, { order: ["status", "name"], hidden: ["name"] }),
  ).toEqual({
    order: ["status", "name", "new-detail"],
    hidden: ["name"],
  });
});
it("retains saved visibility and removes retired keys", () => {
  expect(
    columnLayout(columns, {
      order: ["retired", "new-detail", "name", "status"],
      hidden: ["retired"],
    }),
  ).toEqual({ order: ["new-detail", "name", "status"], hidden: [] });
  expect(columnLayout(columns).hidden).toEqual([]);
});
