import { expect, it } from "vitest";
import { columnFilter } from "./filter-fields";
import { matchesTableSearch } from "./table-search";

const fields = [
  columnFilter("name", "Name", "text", (r: typeof row) => r.name),
  columnFilter("models", "Models", "text", (r: typeof row) => r.models),
  columnFilter("cost", "Cost", "number", (r: typeof row) => r.cost),
  columnFilter(
    "archived",
    "Archived",
    "boolean",
    (r: typeof row) => r.archived,
  ),
  columnFilter("missing", "Missing", "text", () => undefined),
];
const row = {
  name: "Candidate Summary",
  models: ["OpenAI", "Gemini"],
  cost: 0,
  archived: false,
};
it("searches data fields and array values case-insensitively with trimmed input", () => {
  expect(matchesTableSearch(row, fields, " summary ")).toBe(true);
  expect(matchesTableSearch(row, fields, "GEMINI")).toBe(true);
  expect(matchesTableSearch(row, fields, "unrelated")).toBe(false);
  expect(matchesTableSearch(row, fields, "  ")).toBe(true);
});
it("keeps zero and false searchable without inventing values for missing fields", () => {
  expect(matchesTableSearch(row, fields, "0")).toBe(true);
  expect(matchesTableSearch(row, fields, "false")).toBe(true);
  expect(matchesTableSearch(row, fields, "undefined")).toBe(false);
});
