import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PromptMessagePreview } from "@/features/prompts/components/prompt-message-preview";
import { EvalJudgeInstructionsReader } from "./eval-judge-instructions-reader";

vi.mock("@/components/scoped-link", () => ({ default: "a" }));
it("highlights a literal search spanning text and a template variable", () => {
  const markup = renderToStaticMarkup(
    <PromptMessagePreview
      label="User Message"
      value="Criterion: {{criterion.text}}"
      search="Criterion: {{criterion.text}}"
    />,
  );
  expect(markup).toContain(">Criterion: </mark>");
  expect(markup).toContain(">{{criterion.text}}</mark>");
  expect(markup).toContain('data-template-variable="true"');
});
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

it("labels rendered grading messages as recorded evidence, preserving multiple system messages", () => {
  const markup = renderToStaticMarkup(
    <EvalJudgeInstructionsReader
      context="Saved execution"
      historical
      snapshotPending
      backHref="/evals/runs"
      recordedRequests={[
        {
          key: "request",
          caseId: "S01-discovery-city",
          repetition: 1,
          stepIndex: 0,
          criterionId: "city",
          criterion: "Report the saved city",
          request: {
            protocol: "eval-verdict-v1",
            messages: [
              { role: "system", content: "Kortyx verdict protocol" },
              { role: "system", content: "Saved application instructions" },
              {
                role: "user",
                content: "Criterion and evidence <script>unsafe()</script>",
              },
            ],
          },
        },
      ]}
    />,
  );
  expect(markup).toContain("Recorded grading request");
  expect(markup).toContain("final judge snapshot is not yet available");
  expect(markup).toContain("System Message 1");
  expect(markup).toContain("System Message 2");
  expect(markup).toContain("User Message 3");
  expect(markup).toContain("S01-discovery-city");
  expect(markup).toContain("Report the saved city");
  expect(markup).toContain("&lt;script&gt;");
  expect(markup).not.toContain("<script");
  expect(markup).not.toContain("Instructions not recorded.");
  expect(markup).not.toContain("Saved snapshot");
});

it("explains that an unfinished snapshot is pending when no grading requests exist yet", () => {
  const markup = renderToStaticMarkup(
    <EvalJudgeInstructionsReader
      context="Saved execution"
      historical
      snapshotPending
      backHref="/evals/runs"
    />,
  );
  expect(markup).toContain("Judge snapshot is not yet available.");
  expect(markup).toContain("No grading requests have been recorded yet.");
  expect(markup).not.toContain("Instructions not recorded.");
});

it("separates saved messages into read-only cards and highlights template variables", () => {
  const markup = renderToStaticMarkup(
    <EvalJudgeInstructionsReader
      judge={{
        id: "reporting",
        version: "1",
        prompt: {
          id: "today/judge",
          version: 3,
          hash: "a".repeat(64),
          content: {
            format: "system-user",
            messages: [
              {
                role: "system",
                content:
                  "Use successful tool evidence. <script>unsafe()</script>",
              },
              {
                role: "user",
                content:
                  "Criterion: {{criterion.text}}\nObservation: {{observation}}",
              },
            ],
            variablesSchema: {},
            configSchema: {},
            config: {},
            dependencies: [],
          },
        },
      }}
      context="Saved execution"
      historical
      backHref="/evals/runs"
    />,
  );
  expect(markup).toContain("System Message");
  expect(markup).toContain("User Message");
  expect(markup.match(/<pre /g)).toHaveLength(2);
  expect(markup).not.toContain('contenteditable="true"');
  expect(markup.match(/data-template-variable="true"/g)).toHaveLength(2);
  expect(markup).toContain("{{criterion.text}}");
  expect(markup).toContain("&lt;script&gt;");
  expect(markup).not.toContain("<script");
  expect(markup).not.toContain("New version");
});
