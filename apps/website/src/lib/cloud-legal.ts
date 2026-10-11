import { createHash } from "node:crypto";
import dpa1 from "@/legal/cloud/dpa.2026-10-08.staging.1.json";
import dpa2 from "@/legal/cloud/dpa.2026-10-08.staging.2.json";
import dpa3 from "@/legal/cloud/dpa.2026-10-10.staging.3.json";
import dpa5 from "@/legal/cloud/dpa.2026-10-11.5.json";
import dpa4 from "@/legal/cloud/dpa.2026-10-11.staging.4.json";
import legacyReleases from "@/legal/cloud/legacy-releases.json";
import privacy5 from "@/legal/cloud/privacy.2026-10-11.5.json";
import privacy4 from "@/legal/cloud/privacy.2026-10-11.staging.4.json";
import subprocessors5 from "@/legal/cloud/subprocessors.2026-10-11.5.json";
import subprocessors4 from "@/legal/cloud/subprocessors.2026-10-11.staging.4.json";
import terms1 from "@/legal/cloud/terms.2026-10-08.staging.1.json";
import terms2 from "@/legal/cloud/terms.2026-10-08.staging.2.json";
import terms3 from "@/legal/cloud/terms.2026-10-10.staging.3.json";
import terms5 from "@/legal/cloud/terms.2026-10-11.5.json";
import terms4 from "@/legal/cloud/terms.2026-10-11.staging.4.json";
import { siteConfig } from "./site";

export const cloudLegalSlugs = [
  "terms",
  "privacy",
  "dpa",
  "subprocessors",
] as const;
export type CloudLegalSlug = (typeof cloudLegalSlugs)[number];
export type CloudLegalDocument = {
  slug: string;
  version: string;
  effectiveDate: string;
  draft: boolean;
  title: string;
  sections: { title: string; text: string }[];
};
// Frozen, ordered payloads. This is the existing Cloud JSON hash contract.
const documents: CloudLegalDocument[] = [
  terms1,
  terms2,
  terms3,
  terms4,
  privacy4,
  dpa1,
  dpa2,
  dpa3,
  dpa4,
  subprocessors4,
  terms5,
  privacy5,
  dpa5,
  subprocessors5,
];
export const currentCloudLegalVersion = "2026-10-11.5";
export const cloudLegalHashContract = "kortyx-cloud-json-sha256-v1";
export function isCloudLegalSlug(value: string): value is CloudLegalSlug {
  return cloudLegalSlugs.some((slug) => slug === value);
}
export function serializeCloudLegalDocument(
  document: CloudLegalDocument,
): string {
  return JSON.stringify(document);
}
export function hashCloudLegalDocument(document: CloudLegalDocument): string {
  return createHash("sha256")
    .update(serializeCloudLegalDocument(document), "utf8")
    .digest("hex");
}
export function cloudLegalUrls(slug: string, version: string) {
  return {
    canonicalUrl: `${siteConfig.url}/cloud/${slug}`,
    versionUrl: `${siteConfig.url}/cloud/${slug}/${version}`,
    contentUrl: `${siteConfig.url}/legal/cloud/${slug}/${version}.json`,
  };
}
export function getCloudLegalDocument(
  slug: string,
  version = currentCloudLegalVersion,
) {
  return structuredClone(
    documents.find((doc) => doc.slug === slug && doc.version === version),
  );
}
export function getCloudLegalDocuments() {
  return structuredClone(documents);
}
export function getCloudLegalManifest() {
  return {
    schemaVersion: 1,
    hashContract: cloudLegalHashContract,
    hashAlgorithm: "SHA-256",
    manifestUrl: `${siteConfig.url}/legal/cloud/manifest.json`,
    // Website preview selection is not a c15t policy activation.
    currentWebsiteVersion: currentCloudLegalVersion,
    cloudActivation: "pending-private-cloud-change",
    releases: documents.map((document) => ({
      id: `kortyx.cloud.${document.slug}`,
      slug: document.slug,
      type: {
        terms: "terms_and_conditions",
        privacy: "privacy_policy",
        dpa: "data_processing_agreement",
        subprocessors: "subprocessor_list",
      }[document.slug],
      c15tType:
        document.slug === "terms" ? "terms_and_conditions_staging_beta" : null,
      version: document.version,
      effectiveDate: document.effectiveDate,
      effectiveDateScope: document.version.includes("staging")
        ? "staging-draft-only"
        : "candidate-publication-only",
      draft: document.draft,
      productionApproved: false,
      acceptanceRequired: document.slug === "terms",
      hash: hashCloudLegalDocument(document),
      ...cloudLegalUrls(document.slug, document.version),
    })),
    // These originals cannot be redacted and retain their old acceptance hash.
    // Only metadata is public; the exact archives must remain private.
    unavailableHistoricalReleases: legacyReleases
      .filter((release) => !release.available)
      .map(({ available: _available, ...release }) => ({
        ...release,
        reason:
          "Original contains private infrastructure details; exact archive retained by Cloud. No public replacement under this version.",
      })),
  };
}
