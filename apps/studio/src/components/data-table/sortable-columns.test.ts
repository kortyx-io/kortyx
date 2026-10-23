import { expect, it } from "vitest";
import { sortableColumns } from "./sortable-columns";
import { sortTableRows } from "./table-rows";
import type { DataTableColumn } from "./types";

type Row = { amount: number | null; name: string };
const columns: DataTableColumn<Row, string>[] = [
  {
    key: "amount",
    label: "Amount",
    defaultWidth: 100,
    filter: {
      key: "amount",
      label: "Amount",
      kind: "number",
      read: (r) => r.amount,
    },
    render: () => null,
  },
  {
    key: "name",
    label: "Name",
    defaultWidth: 100,
    filter: { key: "name", label: "Name", kind: "text", read: (r) => r.name },
    render: () => null,
  },
  {
    key: "actions",
    label: "Actions",
    defaultWidth: 50,
    filter: false,
    render: () => null,
  },
];
it("sorts local data columns by their raw values while leaving actions and remote columns alone", () => {
  const local = sortableColumns(columns, true);
  expect(local.map((c) => c.sortKey)).toEqual(["amount", "name", undefined]);
  const rows = [
    { amount: 10, name: "long title" },
    { amount: null, name: "missing" },
    { amount: 2, name: "another title" },
  ];
  expect(
    sortTableRows(rows, local, "amount", "desc").map((r) => r.amount),
  ).toEqual([10, 2, null]);
  expect(sortableColumns(columns, false).every((c) => !c.sortKey)).toBe(true);
  expect(
    sortableColumns([{ ...columns[0], sortable: false }], true)[0].sortKey,
  ).toBeUndefined();
});
