import { notFound } from "next/navigation";
import { readPromptLibrary } from "../api/server";
import { PromptLibraryView } from "./prompt-library";
export async function PromptLibraryPage({
  categoryId,
}: {
  categoryId?: string;
}) {
  const result = await readPromptLibrary();
  if (
    result.data &&
    categoryId &&
    categoryId !== "root" &&
    !result.data.categories.some((category) => category.id === categoryId)
  )
    notFound();
  return (
    <PromptLibraryView
      initial={result.data}
      initialError={result.error?.message ?? ""}
      {...(categoryId ? { categoryId } : {})}
    />
  );
}
