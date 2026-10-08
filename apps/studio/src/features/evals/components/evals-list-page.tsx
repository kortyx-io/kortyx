import { cookies } from "next/headers";
import { parseListTablePreferences } from "@/features/telemetry/lib/table-preferences";
import {
  readEvalHistory,
  readEvalTargets,
  readEvaluationHistory,
} from "../api/server";
import { EvalsPageClient } from "./evals-page-client";
import { EvaluationList } from "./evaluation-list";
export async function EvalsListPage({ view }: { view: "runs" | "suites" }) {
  if (view === "runs") {
    const [targets, history] = await Promise.allSettled([
      readEvalTargets(),
      readEvaluationHistory(),
    ]);
    return (
      <EvaluationList
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
    readEvalHistory(),
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
