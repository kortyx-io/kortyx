import { PromptLibraryPage } from "@/features/prompts/components/prompt-library-page";
export default async function Page({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  return <PromptLibraryPage categoryId={(await params).categoryId} />;
}
