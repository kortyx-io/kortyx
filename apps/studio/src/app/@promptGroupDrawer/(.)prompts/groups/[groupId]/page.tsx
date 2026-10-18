import { PromptGroupsPage } from "@/features/prompts/components/prompt-groups-page";
export default async function Page({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  return <PromptGroupsPage groupId={(await params).groupId} drawer />;
}
