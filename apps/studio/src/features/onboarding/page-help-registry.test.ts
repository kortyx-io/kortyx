import { readdirSync } from "node:fs";
import { join } from "node:path";
import { publicCatalog } from "@kortyx/usage-telemetry";
import { expect, it, vi } from "vitest";
import { PAGE_GUIDES, pageGuideId } from "./page-help-registry";

vi.mock("server-only", () => ({}));

import { readSampleDataset } from "@/features/sample-project/data";

it("requires a specific explanation for every primary Studio route", () => {
  function routes(directory: string, path = ""): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith("@") || entry.name === "api") return [];
      if (entry.isDirectory()) {
        const segment = entry.name
          .replace(/\[\.\.\.[^\]]+\]/g, "team/key")
          .replace(/\[[^\]]+\]/g, "example");
        return routes(join(directory, entry.name), `${path}/${segment}`);
      }
      return entry.name === "page.tsx" ? [path || "/"] : [];
    });
  }
  const pages = routes(join(process.cwd(), "src/app"));
  expect(pages.length).toBeGreaterThan(20);
  for (const page of pages)
    expect(pageGuideId(page), `Missing help for ${page}`).not.toBe("other");
});
it("keeps every page identity in the finite telemetry catalog", () => {
  expect(publicCatalog.operations).toContain("studio.help");
  for (const id of Object.keys(PAGE_GUIDES))
    expect(publicCatalog.properties.help_page).toContain(id);
});
it("points diagnostic help at an available correlated sample record", () => {
  const example = new URL(
    PAGE_GUIDES.diagnostic.example,
    "https://sample.example",
  );
  const diagnostic = readSampleDataset().diagnostics.find(
    (item) => item.manifest.diagnosticId === example.pathname.split("/").at(-1),
  );
  expect(diagnostic?.state).toBe("available");
  expect(diagnostic?.manifest.environment).toBe(
    example.searchParams.get("env"),
  );
  expect(diagnostic?.manifest.correlation.runId).toBe("sample-budget-limit");
});
