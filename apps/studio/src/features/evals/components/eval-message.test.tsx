import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EvalMessage } from "./eval-message";

it("renders recorded markdown without enabling HTML or executable links", () => {
  const markup = renderToStaticMarkup(
    <EvalMessage
      text={
        "**Recorded answer**\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert%281%29)\n\n[safe](https://example.com)"
      }
    />,
  );
  expect(markup).toContain("<strong>Recorded answer</strong>");
  expect(markup).not.toContain("<script");
  expect(markup).not.toContain('href="javascript:');
  expect(markup).toContain('href="https://example.com"');
});
