import { cookies } from "next/headers";
import {
  readEvalDetail,
  readEvalHistory,
  readEvalTargets,
} from "@/features/evals/api/server";
import { EvalsPageClient } from "@/features/evals/components/evals-page-client";
import { parseListTablePreferences } from "@/features/telemetry/lib/table-preferences";

export default async function EvalsPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const [{ run }, cookieStore] = await Promise.all([searchParams, cookies()]);
  const [targets, history, detail] = await Promise.allSettled([
    readEvalTargets(),
    readEvalHistory(),
    run ? readEvalDetail(run) : Promise.resolve(null),
  ]);
  return (
    <EvalsPageClient
      initialTargets={
        targets.status === "fulfilled"
          ? targets.value
          : { targets: [], canRun: false }
      }
      initialHistory={
        history.status === "fulfilled" ? history.value : { runs: [] }
      }
      initialDetail={
        detail.status === "fulfilled" ? (detail.value?.run ?? null) : null
      }
      initialError={
        [targets, history, detail].some((value) => value.status === "rejected")
          ? "Some eval data is unavailable. Check the Studio API connection and retry."
          : ""
      }
      preferences={parseListTablePreferences(
        cookieStore.get("kortyx_evals_table_prefs")?.value,
        {
          sortKeys: ["name", "created", "status"] as const,
          pageSizes: [10, 20, 50, 100],
          isViewQuery: (value): value is unknown => value !== undefined,
        },
      )}
    />
  );
}
