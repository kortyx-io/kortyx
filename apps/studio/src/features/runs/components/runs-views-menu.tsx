import type {
  RunsViewQuery,
  useRunsQuery,
} from "@/features/runs/hooks/use-runs-query";
import type { RunsSavedView } from "@/features/runs/lib/saved-views";
import { ListViewsMenu } from "@/features/telemetry/components/list-views-menu";

const STANDARD_VIEW_QUERY: RunsViewQuery = {
  filters: {
    q: null,
    env: null,
    range: null,
    startedAfter: null,
    startedBefore: null,
    status: null,
    provider: null,
    tool: null,
    workflow: null,
    path: null,
    session: null,
    model: null,
    result: null,
    minCost: null,
    minDuration: null,
    minTokens: null,
  },
  sort: "started",
  dir: "desc",
};

export function RunsViewsMenu({
  query,
  views,
  onViewsChange,
}: {
  query: ReturnType<typeof useRunsQuery>;
  views: RunsSavedView[];
  onViewsChange: (views: RunsSavedView[]) => void;
}) {
  return (
    <ListViewsMenu
      currentQuery={query.viewQuery}
      standardQuery={STANDARD_VIEW_QUERY}
      views={views}
      onApplyQuery={query.applyViewQuery}
      onViewsChange={onViewsChange}
    />
  );
}
