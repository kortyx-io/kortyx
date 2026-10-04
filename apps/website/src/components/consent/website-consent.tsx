"use client";

import {
  ConsentDialog,
  ConsentManagerProvider,
  useConsentManager,
} from "@c15t/nextjs";
import { type ReactNode, useEffect } from "react";
import { websiteConsentOptions } from "@/lib/consent";

function WebsitePrivacyDialog() {
  const { activeUI, setActiveUI } = useConsentManager();
  useEffect(() => {
    if (activeUI !== "dialog") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveUI("none");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeUI, setActiveUI]);

  return (
    <ConsentDialog
      hideBranding
      legalLinks={["privacyPolicy", "cookiePolicy"]}
    />
  );
}

export function WebsiteConsent({ children }: { children: ReactNode }) {
  return (
    <ConsentManagerProvider options={websiteConsentOptions}>
      {children}
      <WebsitePrivacyDialog />
    </ConsentManagerProvider>
  );
}
