import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getCloudLegalDocument, hashCloudLegalDocument } from "./cloud-legal";
import { getWebsiteLegalReleases } from "./legal-documents";
import { createLegalFeed, type FeedEntry, legalFeedConfig } from "./legal-feed";

describe("environment-bound legal publishing feed", () => {
  it("requires complete server configuration and never follows service redirects", () => {
    expect(legalFeedConfig({})).toBeNull();
    expect(() =>
      legalFeedConfig({ WEBSITE_LEGAL_ENVIRONMENT: "production" }),
    ).toThrow();
    expect(() =>
      legalFeedConfig({
        WEBSITE_LEGAL_ENVIRONMENT: "production",
        WEBSITE_LEGAL_SERVICE_URL:
          "https://user:password@example.test/api/legal",
        WEBSITE_LEGAL_SERVICE_KEY: "a".repeat(43),
      }),
    ).toThrow();
  });
  it("verifies exact archived Cloud bytes and rejects mismatched environments or hashes", async () => {
    const document = getCloudLegalDocument("terms", "2026-10-10.staging.3")!;
    let bytes = JSON.stringify(document);
    let environment = "staging";
    const entry: FeedEntry = {
      documentId: "kortyx.cloud.terms",
      product: "cloud",
      category: "terms",
      currentVersion: document.version,
      version: document.version,
      effectiveDate: document.effectiveDate,
      title: document.title,
      hash: hashCloudLegalDocument(document),
      contentFormat: "plain-text-v1",
      productionApproved: false,
    };
    const feed = createLegalFeed(
      {
        environment: "staging",
        base: "https://example.test/api/legal",
        key: "a".repeat(43),
      },
      async (url, init) => {
        expect(init?.cache).toBe("no-store");
        expect(init?.redirect).toBe("error");
        const headers = {
          "x-kortyx-consent-tenant": `kortyx-cloud-${environment}`,
          "x-content-sha256": entry.hash,
          "x-legal-content-format": entry.contentFormat,
          "x-legal-hash-contract": "kortyx-cloud-json-sha256-v1",
        };
        return String(url).endsWith("/manifest")
          ? Response.json({ documents: [entry] }, { headers })
          : new Response(bytes, { headers });
      },
    );
    expect((await feed.read("cloud", "terms"))?.bytes).toBe(bytes);
    expect(await feed.read("cloud", "terms", "missing")).toBeNull();
    expect(await feed.read("website", "terms")).toBeNull();
    bytes += "\n";
    await expect(feed.read("cloud", "terms")).rejects.toThrow("integrity");
    bytes = JSON.stringify(document);
    environment = "production";
    await expect(feed.read("cloud", "terms")).rejects.toThrow("environment");
    environment = "staging";
    bytes = JSON.stringify({ ...document, title: "Changed historical Terms" });
    entry.hash = createHash("sha256").update(bytes).digest("hex");
    await expect(feed.read("cloud", "terms")).rejects.toThrow("Historical");
  });
  it("retains the distinct website archive content and hash contract", async () => {
    const original = getWebsiteLegalReleases()[0];
    const { content, ...metadata } = original;
    const entry: FeedEntry = {
      documentId: original.id,
      product: "website",
      category: "privacy",
      currentVersion: original.version,
      version: original.version,
      effectiveDate: original.updatedAt,
      title: content.title,
      hash: original.hash,
      contentFormat: "website-content-v1",
      productionApproved: false,
      websiteRelease: metadata,
    };
    const feed = createLegalFeed(
      {
        environment: "production",
        base: "https://example.test/api/legal",
        key: "a".repeat(43),
      },
      async (url) => {
        const headers = {
          "x-kortyx-consent-tenant": "kortyx-cloud-production",
          "x-content-sha256": entry.hash,
          "x-legal-content-format": entry.contentFormat,
          "x-legal-hash-contract": "kortyx-website-content-sha256-v1",
        };
        return String(url).endsWith("/manifest")
          ? Response.json({ documents: [entry] }, { headers })
          : new Response(JSON.stringify(content), { headers });
      },
    );
    expect(
      (await feed.read("website", "privacy", original.version))?.websiteRelease,
    ).toEqual(original);
  });
});
