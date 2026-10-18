import { expect, it } from "vitest";
import { sortTableRows } from "./table-rows";
import type { DataTableColumn } from "./types";

const rows = [
  { id: "first", amount: 10 },
  { id: "second", amount: 2 },
  { id: "third", amount: 2 },
  { id: "missing", amount: null },
];
const columns: DataTableColumn<(typeof rows)[number], "amount">[] = [
  {
    key: "amount",
    label: "Amount",
    sortKey: "amount",
    defaultWidth: 100,
    filter: {
      key: "amount",
      label: "Amount",
      kind: "number",
      read: (row) => row.amount,
    },
    render: () => null,
  },
];
it("sorts numeric values, preserves ties and keeps missing values last in both directions", () => {
  expect(
    sortTableRows(rows, columns, "amount", "asc").map((row) => row.id),
  ).toEqual(["second", "third", "first", "missing"]);
  expect(
    sortTableRows(rows, columns, "amount", "desc").map((row) => row.id),
  ).toEqual(["first", "second", "third", "missing"]);
  expect(rows.map((row) => row.id)).toEqual([
    "first",
    "second",
    "third",
    "missing",
  ]);
});
it("uses an explicit sort reader when display/filter values have different semantics", () => {
  expect(
    sortTableRows(
      rows,
      [{ ...columns[0], sortValue: (row) => row.id }],
      "amount",
      "asc",
    ).map((row) => row.id),
  ).toEqual(["first", "missing", "second", "third"]);
});
