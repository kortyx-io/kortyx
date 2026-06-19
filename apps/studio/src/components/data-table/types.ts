import type { CSSProperties, ReactNode } from "react";

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
  /** Stable identifier, used for layout persistence and React keys. */
  key: string;
  /** Header text (also used for aria labels and the columns menu search). */
  label: string;
  /** Set to make the column sortable; the value is passed back to `onSort`. */
  sortKey?: S;
  /** Initial column width in pixels. */
  defaultWidth: number;
  /** Minimum width the user can resize the column to. */
  minWidth: number;
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
  /** Total number of rows across all pages (the table slices `data`). */
  totalCount: number;
  onCursorChange: (cursor: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};
