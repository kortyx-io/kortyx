import {
  readEvalDetail,
  readEvalHistory,
  readEvalTargets,
} from "../api/server";
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
  const [detail, history, targets, baseline] = await Promise.allSettled([
    readEvalDetail(id),
    readEvalHistory(),
    readEvalTargets(),
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
          ? targets.value
          : { targets: [], canRun: false }
      }
    />
  );
}
