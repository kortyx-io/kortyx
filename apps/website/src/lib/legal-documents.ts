import { createHash } from "node:crypto";
import releases from "@/legal/website/releases.json";

// Document publishing belongs to Kortyx, not the browser consent store. These
// stable IDs and release fields can later feed c15t's documentSnapshotToken flow.
// Before publishing: archive the exact release content; never overwrite an
// accepted release. Signing tokens, account identity and durable acceptance
// storage belong to the future Cloud backend, not to this website integration.
export const legalDocuments = {
  privacy: {
    id: "kortyx.website.privacy",
    type: "privacy_policy",
    version: "2026-10-11.3-draft",
  },
  terms: {
    id: "kortyx.website.terms",
    type: "terms_and_conditions",
    version: "2026-10-11.3-draft",
  },
  legal: {
    id: "kortyx.website.legal",
    type: "legal_notice",
    version: "2026-10-11.3-draft",
  },
  cookies: {
    id: "kortyx.website.cookies",
    type: "cookie_policy",
    version: "2026-10-11.3-draft",
  },
} as const;

export type LegalDocumentSlug = keyof typeof legalDocuments;

// Keep disclosure data in the release payload and renderer together so a hash
// cannot silently ignore changes to the storage inventory or operator details.
export const browserStorageInventory = [
  {
    key: "theme",
    mechanism: "Local storage",
    purpose: "Remember the display theme you select.",
    duration: "Until cleared in your browser.",
  },
  {
    key: "kortyx_privacy",
    mechanism: "Cookie & local storage",
    purpose:
      "Remember privacy choices with a browser-local preference identifier and timestamp.",
    duration:
      "180 days for preference validity; local storage remains until cleared.",
  },
] as const;

export function isLegalDocumentSlug(slug: string): slug is LegalDocumentSlug {
  return Object.hasOwn(legalDocuments, slug);
}

export function hashLegalDocumentContent(content: unknown): string {
  // The payload is constructed server-side in a fixed field order below. Hash
  // the canonical JSON content, not HTML affected by styling or navigation.
  return createHash("sha256")
    .update(JSON.stringify(content), "utf8")
    .digest("hex");
}

export function getLegalDocumentRelease(
  slug: LegalDocumentSlug,
  version: string = legalDocuments[slug].version,
) {
  const release = releases.find(
    (item) => item.id === legalDocuments[slug].id && item.version === version,
  );
  if (!release) throw new Error("Unknown website legal release");
  return structuredClone(release);
}
export function getWebsiteLegalReleases() {
  return structuredClone(releases);
}
