import {
  readEvalCapabilities,
  readEvalDetail,
  readEvalHistory,
  readEvalLiveDetail,
} from "../api/server";
import { EvalLiveRunPageClient } from "./eval-live-run-page-client";
import { EvalRunPageClient } from "./eval-run-page-client";
export async function EvalRunPage({
  id,
  mode,
  baselineId,
}: {
  id: string;
  mode: "run" | "compare";
  baselineId?: string;
}) {
  if (mode === "run") {
    const [detail, history, capabilities] = await Promise.allSettled([
      readEvalLiveDetail(id),
      readEvalHistory(),
      readEvalCapabilities(),
    ]);
    return (
      <EvalLiveRunPageClient
        id={id}
        initial={detail.status === "fulfilled" ? detail.value.run : null}
        history={history.status === "fulfilled" ? history.value : { runs: [] }}
        canRun={
          capabilities.status === "fulfilled" && capabilities.value.canRun
        }
      />
    );
  }
  const [detail, history, targets, baseline] = await Promise.allSettled([
    readEvalDetail(id),
    readEvalHistory(),
    readEvalCapabilities(),
    baselineId ? readEvalDetail(baselineId) : Promise.resolve(null),
  ]);
  return (
    <EvalRunPageClient
      id={id}
      mode={mode}
      initialDetail={detail.status === "fulfilled" ? detail.value.run : null}
      initialBaseline={
        baseline.status === "fulfilled" ? (baseline.value?.run ?? null) : null
      }
      history={history.status === "fulfilled" ? history.value : { runs: [] }}
      targets={
        targets.status === "fulfilled"
          ? { targets: [], ...targets.value }
          : { targets: [], canRun: false }
      }
    />
  );
}
