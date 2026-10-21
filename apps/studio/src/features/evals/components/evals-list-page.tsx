import { cookies } from "next/headers";
import { parseListTablePreferences } from "@/features/telemetry/lib/table-preferences";
import { readEvaluationChanges } from "../api/changes";
import {
  readEvalHistory,
  readEvalTargets,
  readEvaluationHistory,
  readEvaluationTable,
} from "../api/server";
import { EvalsPageClient } from "./evals-page-client";
import { EvaluationList } from "./evaluation-list";
export async function EvalsListPage({
  view,
  query = {},
}: {
  view: "runs" | "suites";
  query?: Record<string, string | string[] | undefined>;
}) {
  if (view === "runs") {
    const [targets, history, comparisons] = await Promise.allSettled([
      readEvalTargets(),
      readEvaluationTable(query),
      readEvaluationHistory(),
    ]);
    const changes =
      history.status === "fulfilled" && comparisons.status === "fulfilled"
        ? await readEvaluationChanges(
            history.value.runs,
            comparisons.value.runs,
          )
        : {};
    return (
      <EvaluationList
        initialChanges={changes}
        initialTotalCount={
          history.status === "fulfilled" ? history.value.totalCount : 0
        }
        initialTargets={
          targets.status === "fulfilled"
            ? targets.value
            : { targets: [], canRun: false }
        }
        initialHistory={
          history.status === "fulfilled" ? history.value.runs : []
        }
        initialError={
          targets.status === "rejected" || history.status === "rejected"
            ? "Some evaluation data is unavailable. Check the API version and refresh."
            : ""
        }
      />
    );
  }
  const [targets, history, cookieStore] = await Promise.allSettled([
    readEvalTargets(),
    readEvalHistory(true),
    cookies(),
  ]);
  return (
    <EvalsPageClient
      view={view}
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
          ? "Some eval data is unavailable. Refresh to reconnect."
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
