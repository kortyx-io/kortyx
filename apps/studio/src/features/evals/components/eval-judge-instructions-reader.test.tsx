import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { EvalJudgeInstructionsReader } from "./eval-judge-instructions-reader";

vi.mock("@/components/scoped-link", () => ({ default: "a" }));
it("shows missing historical instructions explicitly without substituting other content", () => {
  const markup = renderToStaticMarkup(
    <EvalJudgeInstructionsReader
      judge={{ id: "old", version: "1" }}
      context="Saved execution"
      historical
      backHref="/evals/runs"
    />,
  );
  expect(markup).toContain("Instructions not recorded.");
  expect(markup).not.toContain("Saved snapshot");
  expect(markup).not.toContain('type="search"');
});
it("renders saved instructions as inert text and has no Copy button", () => {
  const markup = renderToStaticMarkup(
    <EvalJudgeInstructionsReader
      judge={{
        id: "custom",
        version: "2",
        instructions: "<script>secret()</script>",
      }}
      context="Saved execution"
      historical
      backHref="/evals/runs"
    />,
  );
  expect(markup).toContain("&lt;script&gt;");
  expect(markup).not.toContain("<script");
  expect(markup).not.toContain(">Copy<");
  expect(markup).toContain("Saved snapshot");
});
