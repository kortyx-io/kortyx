import { notFound } from "next/navigation";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import type { StudioApiError } from "@/lib/studio-api";
import {
  readEvaluatorDetail,
  readEvaluatorExecution,
  readEvaluatorLibrary,
  readEvaluatorRecordings,
  readScoreGroupLibrary,
  readScoreGroupVersion,
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
  const [library, detail, recordings, scoreGroups] = await Promise.all([
    readEvaluatorLibrary(),
    id ? readEvaluatorDetail(id) : undefined,
    id ? readEvaluatorRecordings() : undefined,
    readScoreGroupLibrary(),
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
  if (scoreGroups.error) return showError(scoreGroups.error);
  const versions = scoreGroups.data.groups.flatMap((group) =>
    group.latest ? [group.latest] : [],
  );
  const refs = new Map<string, { id: string; version: number }>();
  for (const definition of [
    detail?.data?.evaluator.draft,
    ...(detail?.data?.versions.map((version) => version.definition) ?? []),
  ]) {
    const ref = definition?.scoreGroup;
    if (
      ref &&
      !versions.some(
        (version) =>
          version.groupId === ref.id && version.version === ref.version,
      )
    )
      refs.set(`${ref.id}:${ref.version}`, ref);
  }
  const pinned = await Promise.all(
    [...refs.values()].map(readScoreGroupVersion),
  );
  for (const result of pinned) {
    if (result.error) return showError(result.error);
    versions.push(result.data);
  }
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
      initialScoreGroups={scoreGroups.data}
      initialScoreVersions={versions}
      initialPreview={{
        recordings: recordings?.data?.recordings ?? [],
        execution: execution?.data ?? null,
        error: recordings?.error?.message ?? execution?.error?.message ?? "",
      }}
    />
  );
}
