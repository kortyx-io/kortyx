import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Navbar } from "@/components/navbar";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/link", () => ({
  default: (props: { href: string; children: ReactNode }) =>
    createElement("a", props),
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    createElement("img", { src, alt }),
}));

describe("shared Navbar", () => {
  beforeEach(() => {
    route.pathname = "/";
  });

  it("renders the common brand, announcement, navigation and actions", () => {
    const html = renderToStaticMarkup(createElement(Navbar));
    expect(html).toContain("Studio preview");
    expect(html).toContain('aria-label="Main navigation"');
    expect(html).toContain('aria-label="Mobile navigation"');
    expect(html).toContain("Open Kortyx on GitHub");
    expect(html).toContain("Start building");
  });

  it("accepts custom components without replacing the common frame", () => {
    const html = renderToStaticMarkup(
      createElement(Navbar, {
        announcement: createElement("aside", null, "Custom announcement"),
        search: createElement("button", { type: "button" }, "Custom search"),
        actions: createElement("button", { type: "button" }, "Custom action"),
        mobileContent: createElement("p", null, "Custom mobile content"),
      }),
    );
    for (const text of [
      "Custom announcement",
      "Custom search",
      "Custom action",
      "Custom mobile content",
      "Start building",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("Studio preview");
  });

  it("allows hiding the announcement", () => {
    const html = renderToStaticMarkup(
      createElement(Navbar, { announcement: null }),
    );
    expect(html).not.toContain("Studio preview");
    expect(html).toContain("Main navigation");
  });

  it.each([
    ["/docs", "page"],
    ["/docs/studio/run-locally", "true"],
    ["/docs/sdk/v0/getting-started/installation", "true"],
  ])("marks Docs active on %s", (pathname, current) => {
    route.pathname = pathname;
    const html = renderToStaticMarkup(createElement(Navbar));
    expect(html).toContain(`href="/docs" aria-current="${current}"`);
  });

  it("does not treat a partial pathname prefix as an active section", () => {
    route.pathname = "/docs-other";
    const html = renderToStaticMarkup(createElement(Navbar));
    expect(html).not.toContain('href="/docs" aria-current=');
  });
});
