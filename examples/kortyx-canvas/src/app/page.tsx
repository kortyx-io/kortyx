import { AgentApp } from "@/components/agent-app";
import { listFacilitatorStyles } from "@/services/demo-data";

export default async function Page() {
  const facilitatorStyles = await listFacilitatorStyles();
  return <AgentApp facilitatorStyles={facilitatorStyles.data ?? []} />;
}
