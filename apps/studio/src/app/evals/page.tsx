import {
  readEvalDetail,
  readEvalHistory,
  readEvalTargets,
} from "@/features/evals/api/server";
import { EvalsPageClient } from "@/features/evals/components/evals-page-client";
export default async function EvalsPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  try {
    const [targets, history, detail] = await Promise.all([
      readEvalTargets(),
      readEvalHistory(),
      run ? readEvalDetail(run) : Promise.resolve(null),
    ]);
    return (
      <EvalsPageClient
        initialTargets={targets}
        initialHistory={history}
        initialDetail={detail?.run ?? null}
      />
    );
  } catch {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Evals</h1>
        <p className="mt-3 text-muted-foreground">
          Eval service is unavailable. Check the Studio API version and
          connection, then refresh.
        </p>
      </div>
    );
  }
}
