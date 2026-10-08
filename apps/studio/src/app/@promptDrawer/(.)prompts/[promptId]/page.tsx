import { PromptDetailPage } from "@/features/prompts/components/prompt-detail-page";
export default function Page({
  params,
}: {
  params: Promise<{ promptId: string }>;
}) {
  return <PromptDetailPage params={params} drawer />;
}
