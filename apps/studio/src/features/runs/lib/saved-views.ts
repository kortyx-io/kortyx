import type { DataTableLayout } from "@/components/data-table";
import type { RunsViewQuery } from "@/features/runs/hooks/use-runs-query";

export type RunsSavedView = {
  id: string;
  name: string;
  query: RunsViewQuery;
  layout: DataTableLayout;
};

/** Server-safe validation for saved views received from cookies or a profile row. */
export function sanitizeRunsSavedViews(value: unknown): RunsSavedView[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRunsSavedView);
}

export function areRunsViewsEqual(
  first: Pick<RunsSavedView, "query" | "layout">,
  second: Pick<RunsSavedView, "query" | "layout">,
) {
  return (
    JSON.stringify(normalizeView(first)) ===
    JSON.stringify(normalizeView(second))
  );
}

function normalizeView(view: Pick<RunsSavedView, "query" | "layout">) {
  return {
    query: {
      ...view.query,
      filters: {
        ...view.query.filters,
        status: [...(view.query.filters.status ?? [])].sort(),
      },
    },
    layout: {
      widths: Object.fromEntries(
        Object.entries(view.layout.widths).sort(([first], [second]) =>
          first.localeCompare(second),
        ),
      ),
      order: view.layout.order,
      hidden: [...view.layout.hidden].sort(),
      pinned: Object.fromEntries(
        Object.entries(view.layout.pinned).sort(([first], [second]) =>
          first.localeCompare(second),
        ),
      ),
    },
  };
}

function isRunsSavedView(value: unknown): value is RunsSavedView {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<RunsSavedView>;
  const query = view.query as Partial<RunsViewQuery> | undefined;
  const layout = view.layout as Partial<DataTableLayout> | undefined;
  return (
    typeof view.id === "string" &&
    typeof view.name === "string" &&
    Boolean(query) &&
    typeof query === "object" &&
    typeof query.sort === "string" &&
    (query.dir === "asc" || query.dir === "desc") &&
    Boolean(query.filters) &&
    typeof query.filters === "object" &&
    Boolean(layout) &&
    typeof layout === "object" &&
    isNumberRecord(layout.widths) &&
    isStringArray(layout.order) &&
    isStringArray(layout.hidden) &&
    isPinRecord(layout.pinned)
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.values(value).every(
      (item) => typeof item === "number" && Number.isFinite(item),
    )
  );
}

function isPinRecord(value: unknown): value is DataTableLayout["pinned"] {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.values(value).every((item) => item === "left" || item === "right")
  );
}
