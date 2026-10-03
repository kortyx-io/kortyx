"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { parseAsBoolean, parseAsString } from "nuqs";
import { useState } from "react";
import { DetailPage } from "@/components/detail/detail-page";
import { Button } from "@/components/ui/button";
import { LiveRefreshButton } from "@/features/telemetry/components/live-refresh-button";
import { detailNavigationHref, useStudioQueryStates } from "@/lib/nuqs";
import { evalRequest } from "../api/client";
import { useEvalRun } from "../hooks/use-eval-run";
import {
  evalCaseHref,
  evalCompareHref,
  evalNavigationHref,
  evalRunHref,
} from "../lib/navigation";
import { isActive } from "../lib/presentation";
import type { EvalDetail, EvalHistory, EvalTargets } from "../schema";
import { EvalComparison } from "./eval-comparison";
import { EvalRunDetail } from "./eval-run-detail";
export function EvalRunPageClient({
  id,
  mode,
  initialDetail,
  initialBaseline,
  history,
  targets,
}: {
  id: string;
  mode: "run" | "compare";
  initialDetail: EvalDetail | null;
  initialBaseline: EvalDetail | null;
  history: EvalHistory;
  targets: EvalTargets;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [query, setQuery] = useStudioQueryStates(
    {
      case: parseAsString,
      baseline: parseAsString,
      live: parseAsBoolean.withDefault(true),
    },
    { shallow: true },
  );
  const [refresh, setRefresh] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const current = useEvalRun(id, initialDetail, refresh);
  const baseline = useEvalRun(query.baseline, initialBaseline, refresh);
  const navigate = (path: string) =>
    router.push(evalNavigationHref(path, search));
  const cancel = async () => {
    setCancelling(true);
    setError("");
    try {
      await evalRequest(`runs/${encodeURIComponent(id)}/cancel`, {});
      setRefresh((n) => n + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not cancel this run.",
      );
    } finally {
      setCancelling(false);
    }
  };
  return (
    <DetailPage
      title={mode === "compare" ? "Compare eval runs" : "Eval run"}
      description="Conversation outcomes and evidence"
    >
      <div className="flex h-full min-h-0 flex-col">
        {error || current.error ? (
          <p
            role="alert"
            className="shrink-0 px-4 py-2 text-xs text-red-700 dark:text-red-400"
          >
            {error || current.error}
          </p>
        ) : null}
        <div className="min-h-0 flex-1">
          {current.detail ? (
            mode === "compare" ? (
              <EvalComparison
                candidate={current.detail}
                baseline={baseline.detail}
                baselineId={query.baseline}
                history={history}
                loading={baseline.loading}
                error={baseline.error}
                onBaselineChange={(baseline) => {
                  void setQuery({ baseline, case: null });
                }}
                onBack={() => navigate(evalRunHref(id))}
              />
            ) : (
              <EvalRunDetail
                run={current.detail}
                liveControl={
                  <LiveRefreshButton
                    enabled={query.live}
                    status={current.liveStatus}
                    onToggle={() => {
                      void setQuery({ live: !query.live });
                    }}
                  />
                }
                onCaseChange={(key) => {
                  if (!key) return;
                  const separator = key.lastIndexOf(":");
                  router.push(
                    detailNavigationHref(
                      `${evalCaseHref(id, key.slice(0, separator), Number(key.slice(separator + 1)))}?case=${encodeURIComponent(key)}`,
                      search,
                    ),
                  );
                }}
                onBack={() => navigate("/evals/runs")}
                canRun={targets.canRun}
                canCompare={history.runs.some(
                  (r) => r.id !== id && !isActive(r.status),
                )}
                cancelling={cancelling}
                onCancel={() => {
                  void cancel();
                }}
                onCompare={() => {
                  const other = history.runs.find(
                    (r) =>
                      r.id !== id &&
                      r.suiteId === current.detail?.suiteId &&
                      r.targetId === current.detail?.targetId &&
                      !isActive(r.status),
                  );
                  navigate(evalCompareHref(id, other?.id));
                }}
              />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <output>
                {current.loading
                  ? "Loading eval run…"
                  : "This eval run could not be loaded."}
              </output>
              <Button variant="outline" onClick={() => navigate("/evals/runs")}>
                Run history
              </Button>
            </div>
          )}
        </div>
      </div>
    </DetailPage>
  );
}
