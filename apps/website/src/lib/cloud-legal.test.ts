import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateStaticParams as contentRoutes,
  GET as getContent,
} from "@/app/legal/cloud/[document]/[release]/route";
import { GET as getManifest } from "@/app/legal/cloud/manifest.json/route";
import legacy from "@/legal/cloud/legacy-releases.json";
import hashes from "@/legal/release-hashes.json";
import {
  cloudLegalSlugs,
  currentCloudLegalVersions,
  getCloudLegalDocument,
  getCloudLegalDocuments,
  getCloudLegalManifest,
  hashCloudLegalDocument,
  isCloudLegalSlug,
  serializeCloudLegalDocument,
} from "./cloud-legal";
import {
  getWebsiteLegalReleases,
  hashLegalDocumentContent,
} from "./legal-documents";

const pinned = hashes as Record<string, string>;
function documentFor(slug: string, version?: string) {
  const document = getCloudLegalDocument(slug, version);
  if (!document) throw new Error(`Missing release: ${slug}/${version}`);
  return document;
}
describe("immutable Cloud publication contract", () => {
  it("pins every published release to reviewed bytes and existing Cloud hash field order", () => {
    for (const document of getCloudLegalDocuments()) {
      expect(Object.keys(document)).toEqual([
        "slug",
        "version",
        "effectiveDate",
        "draft",
        "title",
        "sections",
      ]);
      expect(
        document.sections.every(
          (section) => Object.keys(section).join() === "title,text",
        ),
      ).toBe(true);
      expect(hashCloudLegalDocument(document)).toBe(
        pinned[`${document.slug}/${document.version}`],
      );
      const original = legacy.find(
        (item) =>
          item.slug === document.slug && item.version === document.version,
      );
      if (original)
        expect(hashCloudLegalDocument(document)).toBe(original.hash);
      expect(hashCloudLegalDocument({ ...document, title: "Edited" })).not.toBe(
        hashCloudLegalDocument(document),
      );
    }
    for (const release of getWebsiteLegalReleases()) {
      expect(hashLegalDocumentContent(release.content)).toBe(release.hash);
      expect(release.hash).toBe(pinned[`${release.id}/${release.version}`]);
    }
  });
  it("retains the accepted publicity clause and changes only a new release", () => {
    const historical = documentFor("terms", "2026-10-10.staging.3");
    const current = documentFor("terms");
    expect(JSON.stringify(historical)).toContain(
      "opt out in Organization Settings",
    );
    expect(JSON.stringify(current)).not.toContain("Organization Settings");
    expect(JSON.stringify(current)).toContain("revocable permission");
    expect(JSON.stringify(historical)).toContain("10 business days");
    expect(JSON.stringify(current)).toContain(
      "Rights granted under previously accepted Terms remain unaffected",
    );
    expect(JSON.stringify(current)).not.toContain(
      "https://github.com/kortyx-io/kortyx/discussions",
    );
    expect(JSON.stringify(current)).toContain("not consent to marketing email");
    historical.sections[0].text = "Edited by caller";
    expect(
      getCloudLegalDocument("terms", historical.version)?.sections[0].text,
    ).not.toBe("Edited by caller");
  });
  it("provides all current drafts without privately sourced infrastructure disclosures", () => {
    for (const slug of cloudLegalSlugs) {
      const document = documentFor(slug);
      expect(document.version).toBe(currentCloudLegalVersions[slug]);
      expect(document.draft).toBe(true);
      expect(
        document.sections
          .map((section) => `${section.title} ${section.text}`)
          .join(" "),
      ).not.toMatch(/\bdraft\b|\bstaging\b/i);
      expect(JSON.stringify(document)).not.toMatch(
        /Hetzner|Nuremberg|Coolify|Resend|restore points|consent database/i,
      );
    }
    expect(getCloudLegalManifest().cloudActivation).toBe(
      "pending-private-cloud-change",
    );
    expect(getCloudLegalManifest().unavailableHistoricalReleases).toHaveLength(
      6,
    );
    expect(
      getCloudLegalDocument("privacy", "2026-10-10.staging.3"),
    ).toBeUndefined();
  });
  it("serves the exact hash input bytes and rejects unknown content routes", async () => {
    for (const { document: slug, release } of contentRoutes()) {
      const response = await getContent(new Request("https://kortyx.io"), {
        params: Promise.resolve({ document: slug, release }),
      });
      const bytes = await response.text();
      const document = documentFor(slug, release.slice(0, -5));
      expect(response.status).toBe(200);
      expect(bytes).toBe(serializeCloudLegalDocument(document));
      expect(createHash("sha256").update(bytes, "utf8").digest("hex")).toBe(
        hashCloudLegalDocument(document),
      );
      expect(response.headers.get("cache-control")).toContain("immutable");
    }
    for (const [document, release] of [
      ["toString", "2026-10-11.staging.4.json"],
      ["terms", "unknown.json"],
      ["terms", "2026-10-11.staging.4"],
    ]) {
      expect(
        (
          await getContent(new Request("https://kortyx.io"), {
            params: Promise.resolve({ document, release }),
          })
        ).status,
      ).toBe(404);
    }
    expect(isCloudLegalSlug("__proto__")).toBe(false);
  });
  it("advertises canonical and permanent URLs without manufacturing acceptance", async () => {
    const manifest = await (await getManifest()).json();
    expect(manifest).toEqual(getCloudLegalManifest());
    for (const release of manifest.releases) {
      expect(release.versionUrl).toBe(
        `https://kortyx.io/cloud/${release.slug}/${release.version}`,
      );
      expect(release.contentUrl).toBe(
        `https://kortyx.io/legal/cloud/${release.slug}/${release.version}.json`,
      );
      expect(release.canonicalUrl).toBe(
        `https://kortyx.io/cloud/${release.slug}`,
      );
      expect(release.productionApproved).toBe(false);
      expect(release.effectiveDateScope).toBe(
        release.version.includes("staging")
          ? "staging-draft-only"
          : "candidate-publication-only",
      );
      expect(release.acceptanceRequired).toBe(release.slug === "terms");
      expect(release.c15tType).toBe(
        release.slug === "terms" ? "terms_and_conditions_staging_beta" : null,
      );
    }
  });
});
