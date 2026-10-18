import type {
  TableFilterDefinition,
  TableFilterValue,
} from "@kortyx/telemetry-contracts";
import type { CSSProperties, ReactNode } from "react";

/** Minimum width (px) for every column when resizing. Content truncates below this. */
export const DATA_TABLE_MIN_COLUMN_WIDTH = 48;

export type ColumnPin = "left" | "right";

export type ColumnMotion = {
  style: CSSProperties;
};

/**
 * The complete, serializable column layout produced by every column control
 * (resize, reorder, pin, hide). Keyed by `DataTableColumn.key` so it can be
 * persisted anywhere — localStorage, a user-profile DB row, etc.
 */
export type DataTableLayout = {
  widths: Record<string, number>;
  order: string[];
  hidden: string[];
  pinned: Partial<Record<string, ColumnPin>>;
};

/**
 * A single column definition. Generic over the row type `T` and the union of
 * sortable keys `S`. The table renders the surrounding `<td>`; `render` only
 * needs to return the cell content.
 */
export type DataTableColumn<T, S extends string = never> = {
  /** Data columns declare their filters; selection/action columns explicitly opt out. */
  filter: false | DataTableFilter<T> | DataTableFilter<T>[];
  /** Stable identifier, used for layout persistence and React keys. */
  key: string;
  /** Header text (also used for aria labels and the columns menu search). */
  label: string;
  /** Set to make the column sortable; used as the URL/API sorting identifier. */
  sortKey?: S;
  /** Optional raw sort value; defaults to the column’s first filter reader. */
  sortValue?: (row: T) => string | number | boolean | null | undefined;
  /** Initial column width in pixels. */
  defaultWidth: number;
  /** Extra classes for the `<th>`. */
  headerClassName?: string;
  /** Extra classes for each `<td>`. */
  cellClassName?: string;
  /** Optional native `title` for each `<td>` (tooltip). */
  cellTitle?: (item: T) => string | undefined;
  render: (item: T) => ReactNode;
};

export type DataTablePagination = {
  /** Index of the first row on the current page. */
  cursor: number;
  pageSize: number;
  pageSizes: readonly number[];
  /** Total number of rows across all pages. */
  totalCount: number;
  /** Rows are already sliced by the server. */
  serverSide?: boolean;
  onCursorChange: (cursor: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export type DataTableFilter<T> = TableFilterDefinition & {
  group?: string;
  order?: number;
  optionLabels?: Readonly<Record<string, string>>;
  read: (row: T) => TableFilterValue | readonly TableFilterValue[];
};

/** Existing server/list queries can supply their state; every table still renders search. */
export type DataTableSearch = {
  label?: string;
  placeholder?: string;
  queryKey?: string;
} & (
  | { value: string; onChange: (value: string) => void }
  | { value?: never; onChange?: never }
);

/** URL binding and data processing are configured once per table. */
export type DataTableQueryConfig<S extends string = string> = {
  /** Local rows are processed here; remote rows are processed by the API. */
  mode?: "local" | "remote";
  keys?: Partial<
    Record<
      "q" | "sort" | "dir" | "cursor" | "pageSize" | "filters" | "open",
      string
    >
  >;
  pageSizes?: readonly number[];
  defaults?: { sort?: S; dir?: "asc" | "desc"; pageSize?: number };
};

/** Scope fields affect the data request independently of AND/OR conditions. */
export type DataTableScopeFilter =
  | {
      kind: "text";
      key: string;
      label: string;
      defaultValue?: string;
      placeholder?: string;
    }
  | { kind: "boolean"; key: string; label: string; defaultValue?: boolean }
  | {
      kind: "enum";
      key: string;
      label: string;
      defaultValue: string;
      options: readonly { value: string; label: string }[];
    }
  | {
      kind: "timeRange";
      key: string;
      label: string;
      afterKey: string;
      beforeKey: string;
      defaultValue: import("@kortyx/telemetry-contracts").StudioTimeRange;
    };
