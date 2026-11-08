import { cookies } from "next/headers";
import { parseListTablePreferences } from "@/features/telemetry/lib/table-preferences";
import {
  readEvalHistory,
  readEvalTargets,
  readEvaluationTable,
} from "../api/server";
import { DatasetsPageClient } from "./datasets-page-client";
import { EvaluationList } from "./evaluation-list";
export async function ExperimentsPage({
  query,
}: {
  query: Record<string, string | string[] | undefined>;
}) {
  const [targets, history] = await Promise.allSettled([
    readEvalTargets(),
    readEvaluationTable(query),
  ]);
  return (
    <EvaluationList
      initialTotalCount={
        history.status === "fulfilled" ? history.value.totalCount : 0
      }
      initialTargets={
        targets.status === "fulfilled"
          ? targets.value
          : { targets: [], canRun: false }
      }
      initialHistory={history.status === "fulfilled" ? history.value.runs : []}
      initialError={
        targets.status === "rejected" || history.status === "rejected"
          ? "Some experiment data is unavailable. Check the API version and refresh."
          : ""
      }
    />
  );
}

export async function DatasetsPage() {
  const [targets, history, cookieStore] = await Promise.allSettled([
    readEvalTargets(),
    readEvalHistory(true),
    cookies(),
  ]);
  return (
    <DatasetsPageClient
      initialTargets={
        targets.status === "fulfilled"
          ? targets.value
          : { targets: [], canRun: false }
      }
      initialHistory={
        history.status === "fulfilled" ? history.value : { runs: [] }
      }
      initialError={
        targets.status === "rejected" || history.status === "rejected"
          ? "Some dataset data is unavailable. Refresh to reconnect."
          : ""
      }
      preferences={parseListTablePreferences(
        cookieStore.status === "fulfilled"
          ? cookieStore.value.get("kortyx_evals_table_prefs")?.value
          : undefined,
        {
          sortKeys: ["name", "created", "status"] as const,
          pageSizes: [10, 20, 50, 100],
          isViewQuery: (value): value is unknown => value !== undefined,
        },
      )}
    />
  );
}
