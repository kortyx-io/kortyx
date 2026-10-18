import { expect, it } from "vitest";
import {
  promptLibraryCacheEntries,
  promptLibraryCacheKey,
} from "./library-cache";

it("finds visited filtered libraries without leaking between project scopes", () => {
  const scope = "/projects/prj_0123456789abcdef01234567/prompts";
  const paths = [
    "library",
    "library?search=hello&categoryId=root",
    "library?archived=true&cursor=20",
  ];
  const keys = [
    ...paths.map((path) => promptLibraryCacheKey(scope, path)),
    promptLibraryCacheKey(
      "/projects/prj_aaaaaaaaaaaaaaaaaaaaaaaa/prompts",
      "library",
    ),
    promptLibraryCacheKey("/prompts", "library"),
    "other",
  ];
  expect(promptLibraryCacheEntries(keys, scope)).toEqual(
    paths.map((path) => ({ key: promptLibraryCacheKey(scope, path), path })),
  );
});
