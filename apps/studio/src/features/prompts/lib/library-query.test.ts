import { expect, it } from "vitest";
import { promptLibraryQuery } from "./library-query";

it("uses identical defaults for server reads and client cache keys", () => {
  expect(promptLibraryQuery()).toBe(
    promptLibraryQuery({ q: "", cursor: "0", archived: "false" }),
  );
});
it("preserves the requested category, search, archive state and page on first paint", () => {
  const query = new URLSearchParams(
    promptLibraryQuery(
      { q: "a & b", cursor: "40", archived: "true", assetAction: "rename" },
      "root",
    ),
  );
  expect(Object.fromEntries(query)).toEqual({
    search: "a & b",
    cursor: "40",
    archived: "true",
    categoryId: "root",
  });
  expect(promptLibraryQuery({ q: ["ambiguous", "values"] })).toBe(
    promptLibraryQuery(),
  );
});
