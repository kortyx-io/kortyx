"use client";

import {
  ConsentBanner,
  ConsentDialog,
  ConsentManagerProvider,
  ConsentWidget,
  useConsentManager,
} from "@c15t/nextjs";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  websiteAnalyticsConsentOptions,
  websiteConsentOptions,
} from "@/lib/consent";
import type { WebsiteAnalyticsConfig } from "@/lib/website-analytics";
import type { startWebsiteAnalytics } from "@/lib/website-analytics-client";

type AnalyticsRuntime = ReturnType<typeof startWebsiteAnalytics>;

function WebsiteAnalytics({
  config,
  runtime,
}: {
  config: WebsiteAnalyticsConfig;
  runtime: React.RefObject<AnalyticsRuntime | null>;
}) {
  const { has } = useConsentManager();
  const pathname = usePathname();
  const allowed = has("measurement");
  const currentPath = useRef(pathname);
  currentPath.current = pathname;
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void import("@/lib/website-analytics-client")
      .then(({ startWebsiteAnalytics }) => {
        if (cancelled) return;
        runtime.current = startWebsiteAnalytics(config);
        runtime.current.page(currentPath.current);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      runtime.current?.stop();
      runtime.current = null;
    };
  }, [allowed, config, runtime]);
  useEffect(() => {
    runtime.current?.page(pathname);
  }, [pathname, runtime]);
  return null;
}

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
  const [config, setConfig] = useState<WebsiteAnalyticsConfig | null>(null);
  const runtime = useRef<AnalyticsRuntime | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/website-analytics", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: WebsiteAnalyticsConfig | null) => {
        if (!controller.signal.aborted) setConfig(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const options = useMemo(
    () =>
      config
        ? websiteAnalyticsConsentOptions(() => {
            runtime.current?.stop();
          })
        : websiteConsentOptions,
    [config],
  );
  return (
    <ConsentManagerProvider
      key={config ? "analytics" : "necessary"}
      options={options}
    >
      {children}
      {config && <WebsiteAnalytics config={config} runtime={runtime} />}
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
