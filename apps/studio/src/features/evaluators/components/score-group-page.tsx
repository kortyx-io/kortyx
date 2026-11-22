import { notFound } from "next/navigation";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import {
  readScoreGroupDetail,
  readScoreGroupLibrary,
  readScoreGroupVersion,
} from "../api/server";
import { ScoreGroupEditor } from "./score-group-editor";
export async function ScoreGroupPage({
  id,
  drawer = false,
  searchParams,
}: {
  id?: string;
  drawer?: boolean;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [library, detail, query] = await Promise.all([
    readScoreGroupLibrary(),
    id ? readScoreGroupDetail(id) : undefined,
    searchParams,
  ]);
  const judgePath =
    typeof query.judge === "string" &&
    /^\/evaluators\/(?:new|[a-f0-9-]{36})$/.test(query.judge)
      ? query.judge
      : undefined;
  if (detail?.error?.status === 404 && !drawer) notFound();
  const groupV =
    typeof query.groupV === "string" ? Number(query.groupV) : undefined;
  const pinned =
    id &&
    detail?.data &&
    groupV &&
    Number.isSafeInteger(groupV) &&
    groupV > 0 &&
    !detail.data.versions.some((version) => version.version === groupV)
      ? await readScoreGroupVersion({ id, version: groupV })
      : undefined;
  const error = library.error ?? detail?.error ?? pinned?.error;
  if (error) {
    const content = (
      <StudioDataError title="Unable to load score group" error={error} />
    );
    return drawer ? (
      <DetailDrawer
        title="Score group"
        description="Versioned output fields"
        matchPath={`/evaluators/score-groups/${id ?? "new"}`}
        dismissPath={judgePath ?? "/evaluators"}
      >
        {content}
      </DetailDrawer>
    ) : (
      content
    );
  }
  return (
    <ScoreGroupEditor
      initial={
        detail?.data
          ? {
              ...detail.data,
              versions: pinned?.data
                ? [...detail.data.versions, pinned.data].sort(
                    (a, b) => b.version - a.version,
                  )
                : detail.data.versions,
            }
          : null
      }
      canEdit={library.data?.canEdit ?? false}
      drawer={drawer}
      judgePath={judgePath}
    />
  );
}
