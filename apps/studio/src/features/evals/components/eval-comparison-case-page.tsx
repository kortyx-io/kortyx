import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { DetailLink } from "@/components/detail/detail-link";
import { DetailPage } from "@/components/detail/detail-page";
import { Button } from "@/components/ui/button";
import { studioRouteId } from "@/lib/studio-routes";
import { readEvalDetail } from "../api/server";
import { evalCompareHref, evalComparisonCaseHref } from "../lib/navigation";
import { compareRuns } from "../lib/presentation";
import { EvalComparisonCaseContent } from "./eval-comparison-case-content";

export async function EvalComparisonCasePage({
  params,
  searchParams,
  drawer = false,
}: {
  params: Promise<{ evalRunId: string; caseId: string }>;
  searchParams: Promise<{ baseline?: string }>;
  drawer?: boolean;
}) {
  const [{ evalRunId, caseId: encodedCaseId }, { baseline: baselineId }] =
    await Promise.all([params, searchParams]);
  const caseId = studioRouteId(encodedCaseId);
  if (!baselineId) notFound();
  const [candidate, baseline] = await Promise.all([
    readEvalDetail(evalRunId),
    readEvalDetail(baselineId),
  ]);
  const row = compareRuns(baseline.run, candidate.run).find(
    (r) => r.id === caseId,
  );
  if (!row) notFound();
  const content = (
    <EvalComparisonCaseContent
      row={row}
      baseline={baseline.run}
      candidate={candidate.run}
    />
  );
  return drawer ? (
    <DetailDrawer
      matchPath={
        evalComparisonCaseHref(evalRunId, caseId, baselineId).split("?", 1)[0]
      }
      dismissPath="/evals/cases"
      title={row.name}
      description="Saved run comparison"
    >
      {content}
    </DetailDrawer>
  ) : (
    <DetailPage title={row.name} description="Saved run comparison">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex min-w-0 shrink-0 items-center gap-3 border-b px-4 py-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <DetailLink
              href={evalCompareHref(evalRunId, baselineId)}
              aria-label="Comparison results"
              title="Comparison results"
            >
              <ArrowLeft />
            </DetailLink>
          </Button>
          <h2 className="min-w-0 truncate text-sm font-semibold">{row.name}</h2>
        </header>
        <div className="min-h-0 flex-1">{content}</div>
      </div>
    </DetailPage>
  );
}
