"use client";
import type { StudioEvalLiveDetail } from "@kortyx/agent/evals";
import { parseAsBoolean } from "nuqs";
import { useState } from "react";
import { DetailPage } from "@/components/detail/detail-page";
import { Button } from "@/components/ui/button";
import { LiveRefreshButton } from "@/features/telemetry/components/live-refresh-button";
import { detailNavigationHref, useStudioQueryStates } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { evalRequest } from "../api/client";
import { useEvalLiveRun } from "../hooks/use-eval-live-run";
import {
  evalCaseHref,
  evalCompareHref,
  evalNavigationHref,
} from "../lib/navigation";
import { isActive } from "../lib/presentation";
import type { EvalHistory } from "../schema";
import { EvalRunBodySkeleton } from "./eval-loading";
import { EvalRerunFailed } from "./eval-rerun-failed";
import { EvalRunDetail } from "./eval-run-detail";

export function EvalLiveRunPageClient({
  id,
  initial,
  history,
  canRun,
}: {
  id: string;
  initial: StudioEvalLiveDetail | null;
  history: EvalHistory;
  canRun: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [query, setQuery] = useStudioQueryStates(
    { live: parseAsBoolean.withDefault(true) },
    { shallow: true },
  );
  const [refresh, setRefresh] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const current = useEvalLiveRun(id, initial, refresh);
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
      title="Eval run"
      description="Conversation outcomes and evidence"
    >
      <div className="flex h-full min-h-0 flex-col">
        {error || current.error ? (
          <p
            role="alert"
            className="shrink-0 px-4 py-2 text-xs text-red-700 dark:text-red-400"
          >
            {error || current.error}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setRefresh((n) => n + 1)}
            >
              Retry loading
            </Button>
          </p>
        ) : null}
        <div className="min-h-0 flex-1">
          {current.detail ? (
            <EvalRunDetail
              run={current.detail}
              rerunControl={
                <EvalRerunFailed run={current.detail} canRun={canRun} />
              }
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
              onBack={() =>
                navigate(
                  current.detail?.evaluationId
                    ? `/evals/evaluations/${current.detail.evaluationId}`
                    : "/evals/runs",
                )
              }
              canRun={canRun}
              cancelling={cancelling}
              onCancel={() => {
                void cancel();
              }}
              canCompare={history.runs.some(
                (r) =>
                  r.id !== id &&
                  r.suiteId === current.detail?.suiteId &&
                  r.targetId === current.detail?.targetId &&
                  r.environment === current.detail?.environment &&
                  !isActive(r.status),
              )}
              onCompare={() =>
                navigate(
                  evalCompareHref(
                    id,
                    history.runs.find(
                      (r) =>
                        r.id !== id &&
                        r.suiteId === current.detail?.suiteId &&
                        r.targetId === current.detail?.targetId &&
                        r.environment === current.detail?.environment &&
                        !isActive(r.status),
                    )?.id,
                  ),
                )
              }
            />
          ) : !current.error ? (
            <EvalRunBodySkeleton />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <output>
                {current.error
                  ? "This eval run could not be loaded."
                  : "Loading eval run…"}
              </output>
              <Button
                variant="secondary"
                onClick={() => navigate("/evals/runs")}
              >
                Run history
              </Button>
            </div>
          )}
        </div>
      </div>
    </DetailPage>
  );
}
