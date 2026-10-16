import { afterEach, describe, expect, it, vi } from "vitest";
import { websiteAnalyticsConsentOptions } from "./consent";
import {
  analyticsPage,
  analyticsSource,
  websiteAnalyticsIdentifiers,
} from "./website-analytics";

describe("website analytics boundaries", () => {
  it("maps known referrers to fixed sources without sending arbitrary URLs", () => {
    expect(analyticsSource("https://www.google.es/search?q=private")).toEqual({
      source: "google",
      referrer: "https://www.google.com/",
    });
    expect(
      analyticsSource("https://github.com/private/repo?token=secret"),
    ).toEqual({ source: "github", referrer: "https://github.com/" });
    expect(analyticsSource("https://evilgoogle.com/private")).toEqual({
      source: "other",
      referrer: "",
    });
    expect(analyticsSource("")).toEqual({ source: "direct", referrer: "" });
  });
  const env = {
    WEBSITE_ANALYTICS_ENABLED: "true",
    WEBSITE_POSTHOG_KEY: "phc_publictest",
    WEBSITE_GA4_ID: "G-TEST123",
    WEBSITE_CLOUDFLARE_ANALYTICS_TOKEN: "a".repeat(32),
    PRIVATE_SERVICE_KEY: "must-never-leave-the-server",
  };
  it("exposes only public IDs on the production hostname after explicit enablement", () => {
    expect(websiteAnalyticsIdentifiers(env, "kortyx.io")).toEqual({
      posthogKey: env.WEBSITE_POSTHOG_KEY,
      gaMeasurementId: env.WEBSITE_GA4_ID,
      cloudflareToken: env.WEBSITE_CLOUDFLARE_ANALYTICS_TOKEN,
    });
    for (const host of [
      "localhost",
      "staging.kortyx.dev",
      "pr-1.kortyx.dev",
      "evilkortyx.io",
    ])
      expect(websiteAnalyticsIdentifiers(env, host)).toBeNull();
    expect(
      websiteAnalyticsIdentifiers(
        { ...env, WEBSITE_ANALYTICS_ENABLED: "false" },
        "kortyx.io",
      ),
    ).toBeNull();
    expect(
      websiteAnalyticsIdentifiers(
        { ...env, WEBSITE_GA4_ID: "<script>" },
        "kortyx.io",
      ),
    ).toBeNull();
  });
  it("collects only known public paths, excluding query text, fragments and arbitrary URLs", () => {
    const paths = ["/", "/docs", "/product"];
    expect(analyticsPage("/docs", paths)).toEqual({
      path: "/docs",
      url: "https://kortyx.io/docs",
    });
    for (const path of [
      "/docs?token=secret",
      "/docs#private",
      "/user@example.com",
      "https://example.com/docs",
    ])
      expect(analyticsPage(path, paths)).toBeNull();
  });
  it("uses a fresh opt-in scope and offers equal accept/reject choices", () => {
    const options = websiteAnalyticsConsentOptions(() => {});
    expect(options.storageConfig.storageKey).toBe("kortyx_privacy_v2");
    expect(options.consentCategories).toEqual(["necessary", "measurement"]);
    expect(options.offlinePolicy.policyPacks[0].consent.model).toBe("opt-in");
    expect(
      options.offlinePolicy.policyPacks[0].ui.banner.primaryActions,
    ).toEqual(["accept", "reject"]);
  });
});

const { legal, sitemap } = vi.hoisted(() => ({
  legal: vi.fn(),
  sitemap: vi.fn(),
}));
vi.mock("./legal-feed", () => ({ getPublishedLegal: legal }));
vi.mock("@/app/sitemap", () => ({ default: sitemap }));

describe("runtime analytics publication gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  it("fails closed for missing, stale, unapproved or unavailable disclosures", async () => {
    vi.stubEnv("WEBSITE_ANALYTICS_ENABLED", "true");
    vi.stubEnv("WEBSITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("WEBSITE_GA4_ID", "G-TEST");
    vi.stubEnv("WEBSITE_CLOUDFLARE_ANALYTICS_TOKEN", "a".repeat(32));
    vi.stubEnv("WEBSITE_ANALYTICS_LEGAL_VERSION", "analytics-v1");
    const { GET } = await import("@/app/api/website-analytics/route");
    const request = new Request("https://kortyx.io/api/website-analytics");
    for (const notice of [
      null,
      { entry: { version: "old", productionApproved: true } },
      { entry: { version: "analytics-v1", productionApproved: false } },
    ]) {
      legal.mockResolvedValue(notice);
      expect(await (await GET(request)).json()).toBeNull();
    }
    legal.mockRejectedValue(new Error("service down"));
    expect(await (await GET(request)).json()).toBeNull();
    legal.mockResolvedValue({
      entry: { version: "analytics-v1", productionApproved: true },
    });
    sitemap.mockResolvedValue([{ url: "https://kortyx.io/" }]);
    const response = await GET(request);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({
      gaMeasurementId: "G-TEST",
      paths: ["/"],
    });
  });
});
