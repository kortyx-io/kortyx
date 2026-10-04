import { describe, expect, it } from "vitest";
import { externalLinkProps } from "@/lib/links";

describe("externalLinkProps", () => {
  it.each([
    "https://github.com/kortyx-io/kortyx",
    "http://example.com/legal",
    "//www.aepd.es/",
    "HTTPS://EXAMPLE.COM/privacy",
    "https://kortyx.io.example.com/",
    "http://localhost:6300",
  ])("opens external web destination %s safely in a new tab", (href) => {
    expect(externalLinkProps(href)).toEqual({
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it.each([
    "/privacy",
    "../getting-started",
    "#controls",
    "",
    "https://kortyx.io/docs",
    "//kortyx.io/cookies",
    "mailto:contact@example.com",
    "tel:+34123456789",
    "https://[invalid",
  ])("preserves internal navigation or protocol handler %s", (href) => {
    expect(externalLinkProps(href)).toEqual({});
  });
});
