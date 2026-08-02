import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Filter,
  LayoutPanelTop,
  RefreshCw,
  Search,
} from "lucide-react";
import type { CSSProperties } from "react";
import {
  DATA_TABLE_MIN_COLUMN_WIDTH,
  type DataTableLayout,
} from "@/components/data-table";
import { Skeleton } from "@/components/ui/skeleton";

type LoadingRoute = "runs" | "sessions" | "interrupts";

type LoadingColumn = {
  key: string;
  label: string;
  width: number;
  sortKey?: string;
};

const routeConfig: Record<
  LoadingRoute,
  {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    columns: LoadingColumn[];
  }
> = {
  runs: {
    title: "Runs",
    subtitle: "Operational inbox for every execution",
    searchPlaceholder: "Search runs, sessions, workflows, errors…",
    columns: [
      { key: "status", label: "Status", width: 140, sortKey: "status" },
      { key: "started", label: "Started", width: 108, sortKey: "started" },
      { key: "workflow", label: "Workflows", width: 190 },
      { key: "path", label: "Path", width: 200 },
      { key: "session", label: "Session", width: 155 },
      { key: "model", label: "Model", width: 165 },
      {
        key: "duration",
        label: "Duration",
        width: 108,
        sortKey: "duration",
      },
      { key: "tokens", label: "Tokens", width: 98, sortKey: "tokens" },
      { key: "cost", label: "Cost", width: 100, sortKey: "cost" },
      { key: "result", label: "Result", width: 360 },
    ],
  },
  sessions: {
    title: "Sessions",
    subtitle: "Operational inbox for every session",
    searchPlaceholder: "Search sessions, users, workflows, errors…",
    columns: [
      { key: "status", label: "Status", width: 132, sortKey: "status" },
      {
        key: "activity",
        label: "Last activity",
        width: 118,
        sortKey: "activity",
      },
      { key: "session", label: "Session", width: 155 },
      { key: "identity", label: "User / Tenant", width: 160 },
      { key: "runs", label: "Runs", width: 145, sortKey: "runs" },
      { key: "checkpoint", label: "Checkpoint / Branch", width: 154 },
      {
        key: "duration",
        label: "Duration",
        width: 108,
        sortKey: "duration",
      },
      { key: "tokens", label: "Tokens", width: 96, sortKey: "tokens" },
      { key: "cost", label: "Cost", width: 100, sortKey: "cost" },
      { key: "result", label: "Latest result", width: 330 },
    ],
  },
  interrupts: {
    title: "Interrupts",
    subtitle: "Operational inbox for every human request",
    searchPlaceholder: "Search requests, sessions, workflows, responses…",
    columns: [
      { key: "status", label: "Status", width: 130, sortKey: "status" },
      { key: "created", label: "Created", width: 104, sortKey: "created" },
      {
        key: "age",
        label: "Age / Resolved in",
        width: 130,
        sortKey: "age",
      },
      { key: "request", label: "Request", width: 280 },
      { key: "workflow", label: "Workflow / Node", width: 170 },
      { key: "session", label: "Session", width: 150 },
      { key: "identity", label: "User / Tenant", width: 150 },
      { key: "response", label: "Response", width: 210 },
      { key: "outcome", label: "Resume outcome", width: 190 },
      { key: "run", label: "Run", width: 145 },
    ],
  },
};

const rows = Array.from({ length: 8 }, (_, index) => `row-${index}`);

function StaticToolbar({
  title,
  subtitle,
  searchPlaceholder,
}: {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
}) {
  return (
    <div className="z-20 shrink-0 border-b bg-background/95 px-5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium">
            <span className="size-1.5 rounded-full bg-muted-foreground/50" />
            Live
          </div>
          <div className="flex size-8 items-center justify-center rounded-md border bg-background shadow-xs">
            <RefreshCw className="size-4" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <div className="relative h-8 min-w-[230px] flex-1 rounded-md border border-input bg-transparent shadow-xs dark:bg-input/30">
          <Search className="absolute top-2 left-3 size-4 text-muted-foreground" />
          <span className="block truncate pr-3 pl-9 text-sm leading-8 text-muted-foreground">
            {searchPlaceholder}
          </span>
        </div>
        {[Filter, Columns3, LayoutPanelTop].map((Icon, index) => (
          <div
            key={index === 0 ? "filters" : index === 1 ? "columns" : "views"}
            className="flex size-8 items-center justify-center rounded-md border bg-background shadow-xs"
          >
            <Icon className="size-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

function resolveColumns(
  columns: LoadingColumn[],
  layout: Partial<DataTableLayout> | undefined,
) {
  const defaultOrder = columns.map((column) => column.key);
  const validOrder =
    layout?.order?.length === defaultOrder.length &&
    layout.order.every((key) => defaultOrder.includes(key))
      ? layout.order
      : defaultOrder;
  const hidden = new Set(
    layout?.hidden?.filter((key) => defaultOrder.includes(key)) ?? [],
  );
  const byKey = Object.fromEntries(
    columns.map((column) => [column.key, column]),
  );

  return validOrder
    .filter((key) => !hidden.has(key))
    .map((key) => {
      const column = byKey[key];
      const savedWidth = layout?.widths?.[key];
      return {
        ...column,
        width:
          typeof savedWidth === "number" && Number.isFinite(savedWidth)
            ? Math.max(DATA_TABLE_MIN_COLUMN_WIDTH, savedWidth)
            : column.width,
        pin: layout?.pinned?.[key],
      };
    });
}

function pinnedStyle(
  columns: ReturnType<typeof resolveColumns>,
  index: number,
  area: "header" | "body",
): CSSProperties | undefined {
  const column = columns[index];
  if (!column.pin) return undefined;
  if (column.pin === "left") {
    return {
      position: "sticky",
      left: columns
        .slice(0, index)
        .filter((item) => item.pin === "left")
        .reduce((total, item) => total + item.width, 0),
      zIndex: area === "header" ? 40 : 10,
    };
  }
  return {
    position: "sticky",
    right: columns
      .slice(index + 1)
      .filter((item) => item.pin === "right")
      .reduce((total, item) => total + item.width, 0),
    zIndex: area === "header" ? 40 : 10,
  };
}

export function StudioRouteLoading({
  route,
  layout,
  sort,
  direction = "desc",
  pageSize = 25,
}: {
  route: LoadingRoute;
  layout?: Partial<DataTableLayout>;
  sort: string;
  direction?: "asc" | "desc";
  pageSize?: number;
}) {
  const config = routeConfig[route];
  const columns = resolveColumns(config.columns, layout);
  const tableWidth = columns.reduce((total, column) => total + column.width, 0);
  const SortIcon = direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <output
      aria-label={`Loading ${config.title.toLowerCase()}`}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-background shadow-sm"
    >
      <StaticToolbar {...config} />

      <div className="min-h-0 flex-1 overflow-hidden">
        <div style={{ width: tableWidth, minWidth: "100%" }}>
          <table
            className="table-fixed border-separate border-spacing-0 text-left text-sm"
            style={{ width: tableWidth }}
          >
            <colgroup>
              {columns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className="bg-muted text-xs font-medium text-muted-foreground shadow-[0_1px_0_0_var(--border)]">
              <tr>
                {columns.map((column, columnIndex) => (
                  <th
                    key={column.key}
                    className="relative bg-muted px-3 py-3 after:absolute after:top-2 after:right-0 after:bottom-2 after:w-px after:bg-border"
                    style={pinnedStyle(columns, columnIndex, "header")}
                  >
                    <span className="flex min-w-0 items-center gap-0.5 truncate">
                      {column.label}
                      {column.sortKey === sort ? (
                        <SortIcon className="size-3 shrink-0" />
                      ) : column.sortKey ? (
                        <ArrowUpDown className="size-3 shrink-0 text-muted-foreground/60" />
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row}>
                  {columns.map((column, columnIndex) => (
                    <td
                      key={column.key}
                      className="max-w-0 overflow-hidden border-b bg-background px-3 py-3.5 align-middle"
                      style={pinnedStyle(columns, columnIndex, "body")}
                    >
                      <Skeleton
                        className="h-5"
                        style={{
                          width: `${Math.min(
                            column.width - 24,
                            42 +
                              ((rowIndex * 29 + columnIndex * 17) %
                                Math.max(24, column.width - 66)),
                          )}px`,
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex h-14 shrink-0 items-center justify-between border-t bg-background px-4 text-xs text-muted-foreground">
        <span>Loading results…</span>
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <span className="flex h-8 min-w-12 items-center rounded-md border px-2 text-foreground">
            {pageSize}
          </span>
          <span className="flex h-8 items-center gap-1 rounded-md border px-3 opacity-50">
            <ChevronLeft className="size-4" /> Previous
          </span>
          <span className="font-mono tabular-nums">1/1</span>
          <span className="flex h-8 items-center gap-1 rounded-md border px-3 opacity-50">
            Next <ChevronRight className="size-4" />
          </span>
        </div>
      </div>
    </output>
  );
}
