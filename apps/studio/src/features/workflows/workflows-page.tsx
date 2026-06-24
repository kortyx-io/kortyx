import WorkflowsPageClient from "./components/workflows-page-client";
import { mockWorkflowSystem } from "./data/mock-workflows";

export function WorkflowsPage() {
  return <WorkflowsPageClient system={mockWorkflowSystem} />;
}
