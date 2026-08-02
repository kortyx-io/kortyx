import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import WorkflowsPageClient from "@/features/workflows/components/workflows-page-client";
import { getStudioWorkflows } from "@/lib/studio-api";

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const workflowsResult = await getStudioWorkflows({
    range: typeof params.range === "string" ? params.range : undefined,
    startedAfter:
      typeof params.startedAfter === "string" ? params.startedAfter : undefined,
    startedBefore:
      typeof params.startedBefore === "string"
        ? params.startedBefore
        : undefined,
    workflow: typeof params.workflow === "string" ? params.workflow : undefined,
    version: typeof params.version === "string" ? params.version : undefined,
  });
  if (workflowsResult.error) {
    return (
      <StudioDataError
        title="Unable to load workflows"
        error={workflowsResult.error}
      />
    );
  }

  return <WorkflowsPageClient system={workflowsResult.data} />;
}
