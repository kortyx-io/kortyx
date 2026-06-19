import RunsPageClient from "@/features/runs/components/runs-page-client";
import { getMockRuns } from "@/features/runs/data/mock-runs";

export default async function RunsPage() {
  const runs = await getMockRuns();

  return <RunsPageClient runs={runs} />;
}
