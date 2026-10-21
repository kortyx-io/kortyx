import { notFound } from "next/navigation";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { DetailLink } from "@/components/detail/detail-link";
import { DetailPage } from "@/components/detail/detail-page";
import { Button } from "@/components/ui/button";
import { studioRouteId } from "@/lib/studio-routes";
import { readEvalCase, readEvalLiveDetail } from "../api/server";
import {
  evalCaseHref,
  evalRunHref,
  evaluationCompareHref,
  evaluationHref,
} from "../lib/navigation";
import { caseRows } from "../lib/presentation";
import { EvalLiveCaseContent } from "./eval-live-case-content";
export async function EvalCasePage({
  params,
  drawer = false,
  searchParams,
}: {
  params: Promise<{ evalRunId: string; caseId: string; repetition: string }>;
  drawer?: boolean;
  searchParams?: Promise<{
    evaluationComparison?: string;
    comparisonBaseline?: string;
    suiteId?: string;
    suiteRun?: string;
    repetition?: string;
  }>;
}) {
  const { evalRunId, caseId: encodedCaseId, repetition } = await params;
  const caseId = studioRouteId(encodedCaseId);
  const context = await searchParams;
  const { run: summary } = await readEvalLiveDetail(evalRunId);
  const requested = Number(context?.repetition);
  const selected = summary.cases.some(
    (item) => item.caseId === caseId && item.repetition === requested,
  )
    ? requested
    : Number(repetition);
  const { run } = await readEvalCase(evalRunId, caseId, selected);
  const row = caseRows(run).find(
    (row) => row.caseId === caseId && row.repetition === selected,
  );
  if (!row) notFound();
  const backHref = context?.evaluationComparison
    ? evaluationCompareHref(
        context.evaluationComparison,
        context.comparisonBaseline,
        context.suiteId,
      )
    : run.evaluationId
      ? `${evaluationHref(run.evaluationId)}${context?.suiteRun === evalRunId ? `?suiteRun=${encodeURIComponent(evalRunId)}` : ""}`
      : evalRunHref(evalRunId);
  return drawer ? (
    <DetailDrawer
      matchPath={evalCaseHref(evalRunId, caseId, Number(repetition))}
      dismissPath="/evals/cases"
      title={row.name}
      description={caseId}
    >
      <EvalLiveCaseContent
        run={run}
        caseId={caseId}
        repetition={selected}
        initialLive={summary}
      />
    </DetailDrawer>
  ) : (
    <DetailPage title={row.name} description={caseId}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b p-3">
          <Button variant="ghost" size="xs" asChild>
            <DetailLink href={backHref}>Evaluation results</DetailLink>
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <EvalLiveCaseContent
            run={run}
            caseId={caseId}
            repetition={selected}
            initialLive={summary}
            fullPage
          />
        </div>
      </div>
    </DetailPage>
  );
}
