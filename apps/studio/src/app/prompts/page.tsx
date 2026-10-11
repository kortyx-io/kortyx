import { PromptLibraryPage } from "@/features/prompts/components/prompt-library-page";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PromptLibraryPage searchParams={await searchParams} />;
}
