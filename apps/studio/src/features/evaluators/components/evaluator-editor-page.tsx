import { notFound } from "next/navigation";
import { readEvalTargets } from "@/features/evals/api/server";
import { readPromptLibrary } from "@/features/prompts/api/server";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import { readEvaluatorDetail, readEvaluatorLibrary } from "../api/server";
import { EvaluatorEditor } from "./evaluator-editor";
export async function EvaluatorEditorPage({ id }: { id?: string }) {
  const [library, detail, prompts, targets] = await Promise.all([
    readEvaluatorLibrary(),
    id ? readEvaluatorDetail(id) : undefined,
    readPromptLibrary(),
    readEvalTargets().catch(() => null),
  ]);
  if (detail?.error?.status === 404) notFound();
  if (library.error)
    return (
      <StudioDataError title="Unable to load evaluator" error={library.error} />
    );
  if (detail?.error)
    return (
      <StudioDataError title="Unable to load evaluator" error={detail.error} />
    );
  if (prompts.error)
    return (
      <StudioDataError title="Unable to load evaluator" error={prompts.error} />
    );
  return (
    <EvaluatorEditor
      library={library.data}
      initial={detail?.data ?? null}
      prompts={prompts.data}
      targets={targets}
    />
  );
}
