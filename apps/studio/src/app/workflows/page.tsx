import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import WorkflowsPageClient from "@/features/workflows/components/workflows-page-client";
import { getStudioWorkflows } from "@/lib/studio-api";

export default async function WorkflowsPage() {
  const workflowsResult = await getStudioWorkflows();
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
