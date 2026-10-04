import type { ConsentManagerProvider } from "@c15t/nextjs";
import type { ComponentProps } from "react";

// This website has no optional services. Do not add a tracker without updating
// its disclosure, consent category, policy and pre-consent blocking tests.
// Offline mode is deliberate: it makes no consent-backend requests. It cannot
// provide the durable authenticated records required for Cloud terms acceptance.
export const websiteConsentOptions = {
  mode: "offline",
  consentCategories: ["necessary"],
  offlinePolicy: {
    policyPacks: [
      {
        id: "kortyx-website-necessary-only",
        match: { isDefault: true },
        consent: { model: "opt-in", expiryDays: 180 },
        // Keep the preference dialog usable without prompting on first visit.
        ui: {
          mode: "none",
          dialog: { allowedActions: ["customize"], layout: ["customize"] },
        },
      },
    ],
  },
  scripts: [],
  storageConfig: {
    storageKey: "kortyx_privacy",
    crossSubdomain: false,
    defaultExpiryDays: 180,
  },
  legalLinks: {
    privacyPolicy: { href: "/privacy", target: "_self" },
    cookiePolicy: { href: "/cookies", target: "_self" },
  },
  i18n: {
    locale: "en",
    detectBrowserLanguage: false,
    messages: {
      en: {
        consentManagerDialog: {
          title: "Privacy settings",
          description:
            "This website has no optional analytics or advertising scripts. Preferences stay in your browser; they are not Cloud terms acceptance records.",
        },
        common: { save: "Save preferences", close: "Close privacy settings" },
        consentTypes: {
          necessary: {
            title: "Necessary storage",
            description:
              "Browser-local storage remembers your privacy choices. Your chosen theme is stored separately. No optional tracking categories are enabled.",
          },
        },
      },
    },
  },
  colorScheme: "dark",
  theme: {
    dark: {
      primary: "#a89cff",
      primaryHover: "#c9c1ff",
      textOnPrimary: "#08080c",
      surface: "#111119",
      surfaceHover: "#1b1b29",
      border: "#454354",
      text: "#f4f3f8",
      textMuted: "#b8b5c9",
    },
    typography: { fontFamily: "var(--font-geist-sans), sans-serif" },
  },
} satisfies ComponentProps<typeof ConsentManagerProvider>["options"];
