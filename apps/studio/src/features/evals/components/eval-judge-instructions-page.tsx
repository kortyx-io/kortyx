import type { EvalJudgeIdentity } from "@kortyx/agent/evals";
import { notFound } from "next/navigation";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { DetailPage } from "@/components/detail/detail-page";
import { studioRouteId } from "@/lib/studio-routes";
import { readEvalCase, readEvalDetail, readEvalTargets } from "../api/server";
import { evalCaseHref, evalSuiteHref } from "../lib/navigation";
import { EvalJudgeInstructionsReader } from "./eval-judge-instructions-reader";

export async function EvalJudgeInstructionsPage({
  params,
  searchParams,
  drawer = false,
}: {
  params: Promise<{ source: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  drawer?: boolean;
}) {
  const { source, id: encodedId } = await params;
  const id = studioRouteId(encodedId);
  const query = await searchParams;
  const value = (key: string) =>
    typeof query[key] === "string" ? (query[key] as string) : undefined;
  let judge: EvalJudgeIdentity | null | undefined;
  let context: string;
  let backHref: string;
  if (source === "target") {
    const targets = await readEvalTargets();
    const target = targets.targets.find((item) => item.id === id);
    const suite = target?.manifest?.suites.find(
      (item) => item.id === value("suiteId"),
    );
    if (!target || !suite) notFound();
    const studioAvailable = Boolean(
      target.manifest?.studioJudging && targets.studioJudge,
    );
    const selected =
      targets.settings?.defaults.judge ?? (studioAvailable ? "studio" : "app");
    judge =
      selected === "studio"
        ? targets.studioJudge && {
            ...targets.studioJudge,
            ...(suite.judge?.prompt ? { prompt: suite.judge.prompt } : {}),
          }
        : (suite.judge ?? target.manifest?.judge);
    context = `${suite.name ?? suite.id} · Configured ${selected === "studio" ? "Studio" : "App"} judge`;
    backHref = evalSuiteHref(id, suite.id);
  } else if (source === "run") {
    const caseId = value("caseId");
    const repetition = Number(value("repetition") ?? 1);
    if (!Number.isSafeInteger(repetition) || repetition < 1) notFound();
    const { run } = caseId
      ? await readEvalCase(id, caseId, repetition)
      : await readEvalDetail(id);
    // Only execution evidence can establish the instructions used. The request
    // or today's configured judge may differ from the judge that graded it.
    judge = run.result?.judge;
    context = `${run.suite.name ?? run.suiteId} · Saved execution`;
    backHref = caseId ? evalCaseHref(id, caseId, repetition) : "/evals/runs";
  } else notFound();
  const returnPath = value("judgeReturn");
  if (returnPath && /^\/evals\/(runs|evaluations\/[^/?#]+)$/.test(returnPath))
    backHref = returnPath;
  const backQuery = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) =>
      typeof value === "string" && key !== "detailView" && key !== "judgeReturn"
        ? [[key, value]]
        : [],
    ),
  );
  if (backQuery.size) backHref += `?${backQuery}`;
  const content = (
    <EvalJudgeInstructionsReader
      judge={judge ?? undefined}
      context={context}
      historical={source === "run"}
      backHref={backHref}
    />
  );
  return drawer ? (
    <DetailDrawer
      matchPath={`/evals/judges/${source}/${encodeURIComponent(id)}`}
      dismissPath={source === "run" ? "/evals/cases" : "/evals/suites"}
      title="Judge instructions"
      description={context}
    >
      {content}
    </DetailDrawer>
  ) : (
    <DetailPage title="Judge instructions" description={context}>
      {content}
    </DetailPage>
  );
}
