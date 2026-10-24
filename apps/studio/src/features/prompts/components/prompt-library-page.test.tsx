import { expect, it, vi } from "vitest";
import { readPromptLibrary } from "../api/server";
import { PromptLibraryPage } from "./prompt-library-page";

vi.mock("../api/server", () => ({
  readPromptLibrary: vi.fn(async () => ({
    data: { categories: [] },
    error: null,
  })),
}));
vi.mock("./prompt-library", () => ({ PromptLibraryView: () => null }));
it("awaits the filtered server snapshot and supplies its exact client cache key", async () => {
  const view = await PromptLibraryPage({
    categoryId: "root",
    searchParams: { q: "welcome", archived: "true", cursor: "20" },
  });
  const query =
    "search=welcome&cursor=20&limit=20&archived=true&sort=name&dir=asc&categoryId=root";
  expect(readPromptLibrary).toHaveBeenCalledWith(query);
  expect(view.props.initialPath).toBe(`library?${query}`);
  expect(view.props.initial).toEqual({ categories: [] });
});
