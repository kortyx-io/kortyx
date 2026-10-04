import { describe, expect, it } from "vitest";
import { websiteConsentOptions } from "./consent";
import { browserStorageInventory } from "./legal-documents";

describe("website consent foundation", () => {
  it("shows a first-visit notice without adding a backend or nonexistent trackers", () => {
    expect(websiteConsentOptions.mode).toBe("offline");
    expect(websiteConsentOptions.scripts).toEqual([]);
    expect(websiteConsentOptions.consentCategories).toEqual(["necessary"]);
    expect(websiteConsentOptions.offlinePolicy.policyPacks[0].ui.mode).toBe(
      "banner",
    );
    expect(
      websiteConsentOptions.offlinePolicy.policyPacks[0].consent.model,
    ).toBe("opt-in");
    expect(websiteConsentOptions).not.toHaveProperty("user");
    expect(websiteConsentOptions).not.toHaveProperty("backendURL");
    expect(
      websiteConsentOptions.offlinePolicy.policyPacks[0].ui.banner
        .allowedActions,
    ).toEqual(["accept", "customize"]);
    expect(websiteConsentOptions.i18n.messages.en.common.acceptAll).toBe(
      "Got it",
    );
  });

  it("scopes stored preferences to this website and matches its disclosure", () => {
    expect(websiteConsentOptions.storageConfig.crossSubdomain).toBe(false);
    expect(websiteConsentOptions.storageConfig.defaultExpiryDays).toBe(180);
    expect(browserStorageInventory.map((item) => item.key)).toContain(
      websiteConsentOptions.storageConfig.storageKey,
    );
    expect(websiteConsentOptions.legalLinks.privacyPolicy.href).toBe(
      "/privacy",
    );
    expect(websiteConsentOptions.legalLinks.cookiePolicy.href).toBe("/cookies");
  });
});
