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
        // Show a first-visit storage notice, without implying optional tracking.
        ui: {
          mode: "banner",
          banner: {
            allowedActions: ["accept", "customize"],
            primaryActions: ["accept"],
            layout: ["customize", "accept"],
          },
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
        cookieBanner: {
          title: "Cookies & privacy",
          description:
            "Kortyx uses only necessary cookies and local storage to remember your privacy choices and selected theme. Review the details or acknowledge this notice.",
        },
        consentManagerDialog: {
          title: "Privacy settings",
          description:
            "Manage the necessary cookies and local storage used for your privacy choices and selected theme. These preferences stay in your browser.",
        },
        common: {
          acceptAll: "Got it",
          customize: "Privacy settings",
          save: "Save preferences",
          close: "Close privacy settings",
        },
        consentTypes: {
          necessary: {
            title: "Necessary storage",
            description:
              "Always active. The preference cookie expires after 180 days. Local storage keeps your preferences and selected theme until you clear site storage in your browser.",
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
    slots: {
      buttonPrimary: { style: { minHeight: "44px", paddingInline: "16px" } },
      buttonSecondary: { style: { minHeight: "44px", paddingInline: "16px" } },
      consentDialogTitle: { style: { fontSize: "18px", lineHeight: "26px" } },
    },
  },
} satisfies ComponentProps<typeof ConsentManagerProvider>["options"];
