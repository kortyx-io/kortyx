import { notFound } from "next/navigation";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import { readEvaluatorDetail, readEvaluatorLibrary } from "../api/server";
import { EvaluatorEditor } from "./evaluator-editor";
export async function EvaluatorEditorPage({ id }: { id?: string }) {
  const [library, detail] = await Promise.all([
    readEvaluatorLibrary(),
    id ? readEvaluatorDetail(id) : undefined,
  ]);
  if (detail?.error?.status === 404) notFound();
  if (library.error)
    return (
      <StudioDataError title="Unable to load judges" error={library.error} />
    );
  if (detail?.error)
    return (
      <StudioDataError title="Unable to load judge" error={detail.error} />
    );
  return (
    <EvaluatorEditor library={library.data} initial={detail?.data ?? null} />
  );
}
