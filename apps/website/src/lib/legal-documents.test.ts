import { describe, expect, it } from "vitest";
import {
  browserStorageInventory,
  getLegalDocumentRelease,
  hashLegalDocumentContent,
  isLegalDocumentSlug,
  legalDocuments,
} from "./legal-documents";
import { getTrustPage, isTrustPageSlug, trustPageSlugs } from "./trust";

describe("version-ready legal documents", () => {
  it("has a unique stable ID and explicit draft version for every legal text", () => {
    const documents = Object.values(legalDocuments);
    expect(new Set(documents.map((doc) => doc.id)).size).toBe(documents.length);
    for (const [slug, definition] of Object.entries(legalDocuments)) {
      expect(getTrustPage(slug as keyof typeof legalDocuments).isLegal).toBe(
        true,
      );
      expect(definition.version).toMatch(/\d{4}-\d{2}-\d{2}\.\d+-draft$/);
    }
  });

  it("binds a release to its exact document content, not browser consent state", () => {
    const release = getLegalDocumentRelease("terms");
    expect(release.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(getLegalDocumentRelease("terms").hash).toBe(release.hash);
    expect(
      hashLegalDocumentContent({ ...release.content, title: "Changed terms" }),
    ).not.toBe(release.hash);
    expect(release.type).toBe("terms_and_conditions");
    expect(release.acceptanceRequired).toBe(false);
  });

  it("includes operator and storage disclosures in the hashed content", () => {
    const release = getLegalDocumentRelease("cookies");
    expect(release.content.storageInventory).toEqual(browserStorageInventory);
    expect(
      hashLegalDocumentContent({
        ...release.content,
        operator: { brand: "Different operator" },
      }),
    ).not.toBe(release.hash);
    expect(
      hashLegalDocumentContent({ ...release.content, storageInventory: [] }),
    ).not.toBe(release.hash);
  });

  it("does not represent unreviewed drafts as effective notices", () => {
    for (const slug of Object.keys(legalDocuments)) {
      const release = getLegalDocumentRelease(
        slug as keyof typeof legalDocuments,
      );
      expect(release.status).toBe("draft");
      expect(release.effectiveDate).toBeNull();
      expect(release.content.operator.operatorName).toBeNull();
      expect(release.acceptanceRequired).toBe(false);
    }
  });

  it("rejects unknown routes and inherited object properties", () => {
    expect(trustPageSlugs).toHaveLength(7);
    expect(isTrustPageSlug("about")).toBe(true);
    expect(isTrustPageSlug("toString")).toBe(false);
    expect(isLegalDocumentSlug("about")).toBe(false);
    expect(isLegalDocumentSlug("__proto__")).toBe(false);
  });
});
