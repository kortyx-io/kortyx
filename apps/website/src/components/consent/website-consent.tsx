"use client";

import {
  ConsentBanner,
  ConsentDialog,
  ConsentManagerProvider,
  ConsentWidget,
  useConsentManager,
} from "@c15t/nextjs";
import { X } from "lucide-react";
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
    <ConsentDialog.Root
      trapFocus
      scrollLock
      aria-modal="true"
      aria-describedby="kortyx-privacy-description"
    >
      <ConsentDialog.Card>
        <ConsentDialog.Header>
          <div className="flex items-center justify-between gap-4">
            <ConsentDialog.HeaderTitle />
            <button
              type="button"
              aria-label="Close privacy settings"
              onClick={() => setActiveUI("none")}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-[#b8b5c9] hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a89cff]"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <ConsentDialog.HeaderDescription
            id="kortyx-privacy-description"
            legalLinks={["privacyPolicy", "cookiePolicy"]}
          />
        </ConsentDialog.Header>
        <ConsentDialog.Content>
          <ConsentWidget hideBranding useProvider />
        </ConsentDialog.Content>
      </ConsentDialog.Card>
    </ConsentDialog.Root>
  );
}

export function WebsiteConsent({ children }: { children: ReactNode }) {
  return (
    <ConsentManagerProvider options={websiteConsentOptions}>
      {children}
      <ConsentBanner
        hideBranding
        trapFocus={false}
        scrollLock={false}
        legalLinks={["privacyPolicy", "cookiePolicy"]}
      />
      <WebsitePrivacyDialog />
    </ConsentManagerProvider>
  );
}
