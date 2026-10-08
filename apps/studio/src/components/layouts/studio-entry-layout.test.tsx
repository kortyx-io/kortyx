import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { StudioEntryLayout } from "./studio-entry-layout";

vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string }) => (
    <span data-src={props.src} />
  ),
}));

it("reuses Studio branding and a rounded, theme-aware root for extension flows", () => {
  const html = renderToStaticMarkup(
    <StudioEntryLayout>
      <h1>Extension content</h1>
    </StudioEntryLayout>,
  );
  expect(html).toContain("Kortyx");
  expect(html).toContain("/logo.png");
  expect(html).toContain("rounded-2xl");
  expect(html).toContain("bg-background");
  expect(html).toContain("Extension content");
  expect(html).not.toContain("<html");
  expect(html).not.toContain("<script");
});
