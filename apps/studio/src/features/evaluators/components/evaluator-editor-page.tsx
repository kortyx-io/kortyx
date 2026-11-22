import { notFound } from "next/navigation";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import type { StudioApiError } from "@/lib/studio-api";
import {
  readEvaluatorDetail,
  readEvaluatorExecution,
  readEvaluatorLibrary,
  readEvaluatorRecordings,
} from "../api/server";
import { EvaluatorDetailHeader } from "./evaluator-detail-header";
import { EvaluatorEditor } from "./evaluator-editor";
export async function EvaluatorEditorPage({
  id,
  drawer = false,
}: {
  id?: string;
  drawer?: boolean;
}) {
  const [library, detail, recordings] = await Promise.all([
    readEvaluatorLibrary(),
    id ? readEvaluatorDetail(id) : undefined,
    id ? readEvaluatorRecordings() : undefined,
  ]);
  if (detail?.error?.status === 404 && !drawer) notFound();
  const showError = (error: StudioApiError) => {
    const content = (
      <StudioDataError title="Unable to load judge" error={error} />
    );
    return drawer ? (
      <DetailDrawer
        customHeader
        title="Judge details"
        description="Versioned judge instructions"
        matchPath={`/evaluators/${id}`}
        dismissPath="/evaluators"
      >
        <div className="flex h-full min-h-0 flex-col">
          <EvaluatorDetailHeader title="Judge details" status="Unavailable" />
          <div className="min-h-0 flex-1">{content}</div>
        </div>
      </DetailDrawer>
    ) : (
      content
    );
  };
  if (library.error) return showError(library.error);
  if (detail?.error) return showError(detail.error);
  const sampleExecutionId =
    !library.data.canEdit && !library.data.canRun
      ? detail?.data?.executions[0]?.id
      : undefined;
  const execution = sampleExecutionId
    ? await readEvaluatorExecution(sampleExecutionId)
    : undefined;
  return (
    <EvaluatorEditor
      drawer={drawer}
      library={library.data}
      initial={detail?.data ?? null}
      initialPreview={{
        recordings: recordings?.data?.recordings ?? [],
        execution: execution?.data ?? null,
        error: recordings?.error?.message ?? execution?.error?.message ?? "",
      }}
    />
  );
}
