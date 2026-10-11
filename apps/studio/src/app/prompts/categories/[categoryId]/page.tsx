import { PromptLibraryPage } from "@/features/prompts/components/prompt-library-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PromptLibraryPage
      categoryId={(await params).categoryId}
      searchParams={await searchParams}
    />
  );
}
