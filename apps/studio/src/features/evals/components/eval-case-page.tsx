import { notFound } from "next/navigation";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { DetailLink } from "@/components/detail/detail-link";
import { DetailPage } from "@/components/detail/detail-page";
import { DetailHeader } from "@/components/detail/detail-primitives";
import { Button } from "@/components/ui/button";
import { readEvalDetail } from "../api/server";
import { evalCaseHref, evalRunHref } from "../lib/navigation";
import { caseRows } from "../lib/presentation";
import { EvalCaseContent } from "./eval-case-inspector";
import { EvalStatus } from "./eval-status";
export async function EvalCasePage({
  params,
  drawer = false,
}: {
  params: Promise<{ evalRunId: string; caseId: string; repetition: string }>;
  drawer?: boolean;
}) {
  const { evalRunId, caseId, repetition } = await params;
  const { run } = await readEvalDetail(evalRunId);
  const row = caseRows(run).find(
    (row) => row.caseId === caseId && row.repetition === Number(repetition),
  );
  if (!row) notFound();
  return drawer ? (
    <DetailDrawer
      matchPath={evalCaseHref(evalRunId, caseId, Number(repetition))}
      dismissPath="/evals/cases"
      title={row.name}
      description={`Attempt ${row.repetition} · Evaluation results`}
    >
      <EvalCaseContent row={row} />
    </DetailDrawer>
  ) : (
    <DetailPage title={row.name} description="Evaluation results">
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b p-3">
          <Button variant="ghost" size="xs" asChild>
            <DetailLink href={evalRunHref(evalRunId)}>Eval run</DetailLink>
          </Button>
        </div>
        <DetailHeader
          status={<EvalStatus status={row.status} />}
          eyebrow="Case evaluation"
          title={row.name}
          description={`Attempt ${row.repetition} · ${run.suite.name ?? run.suiteId}`}
        />
        <div className="min-h-0 flex-1">
          <EvalCaseContent row={row} />
        </div>
      </div>
    </DetailPage>
  );
}
