import { notFound } from "next/navigation";
import { readPromptLibrary } from "../api/server";
import {
  type PromptLibrarySearch,
  promptLibraryQuery,
} from "../lib/library-query";
import { PromptLibraryView } from "./prompt-library";
export async function PromptLibraryPage({
  categoryId,
  searchParams,
}: {
  categoryId?: string;
  searchParams?: PromptLibrarySearch;
}) {
  const query = promptLibraryQuery(searchParams, categoryId);
  const result = await readPromptLibrary(query);
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
      initialPath={`library?${query}`}
      initialError={result.error?.message ?? ""}
      {...(categoryId ? { categoryId } : {})}
    />
  );
}
