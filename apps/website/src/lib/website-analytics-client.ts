import type { PostHog } from "posthog-js";
import {
  analyticsPage,
  analyticsSource,
  type WebsiteAnalyticsConfig,
} from "./website-analytics";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  __cfBeacon?: unknown;
  [key: `ga-disable-${string}`]: boolean;
};

export function clearAnalyticsCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=")[0];
    if (!/^_ga(?:_|$)|^ph_/.test(name)) continue;
    for (const domain of ["", "; Domain=kortyx.io", "; Domain=.kortyx.io"]) {
      // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API lacks support in some supported browsers.
      document.cookie = `${name}=; Path=/; Max-Age=0${domain}; SameSite=Lax`;
    }
  }
}

export function startWebsiteAnalytics(config: WebsiteAnalyticsConfig) {
  const browser = window as unknown as AnalyticsWindow;
  let active = true;
  let posthog: PostHog | undefined;
  let googleReady = false;
  let currentPath: string | null = null;
  const scripts: HTMLScriptElement[] = [];
  const source = analyticsSource(document.referrer);
  browser[`ga-disable-${config.gaMeasurementId}`] = false;

  function gtag(..._args: unknown[]) {
    // Google requires Arguments objects, rather than arrays, in the queue.
    browser.dataLayer ??= [];
    // biome-ignore lint/complexity/noArguments: gtag's documented queue contract uses Arguments objects.
    browser.dataLayer.push(arguments);
  }

  function googlePage() {
    const page = currentPath && analyticsPage(currentPath, config.paths);
    if (!active || !googleReady || !page) return;
    gtag("event", "page_view", {
      page_location: page.url,
      page_title: page.path,
      page_referrer: source.referrer,
      send_to: config.gaMeasurementId,
    });
  }

  function posthogPage() {
    const page = currentPath && analyticsPage(currentPath, config.paths);
    if (active && page) posthog?.capture("$pageview", { page_path: page.path });
  }

  const googleScript = document.createElement("script");
  googleScript.async = true;
  googleScript.src = `https://www.googletagmanager.com/gtag/js?id=${config.gaMeasurementId}`;
  googleScript.referrerPolicy = "origin";
  googleScript.onload = () => {
    if (!active) return;
    const page = analyticsPage(currentPath ?? "/", config.paths);
    gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    gtag("js", new Date());
    gtag("consent", "update", { analytics_storage: "granted" });
    gtag("config", config.gaMeasurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: "kortyx.io",
      cookie_expires: 180 * 86400,
      cookie_update: false,
      page_location: page?.url ?? "https://kortyx.io/",
      page_referrer: source.referrer,
      page_title: page?.path ?? "/",
      ignore_referrer: !source.referrer,
    });
    googleReady = true;
    googlePage();
  };
  document.head.append(googleScript);
  scripts.push(googleScript);

  // The no-external build cannot fetch replay/survey/other optional SDK bundles.
  void import("posthog-js/no-external")
    .then(({ default: sdk }) => {
      if (!active) return;
      sdk.init(config.posthogKey, {
        api_host: "https://eu.i.posthog.com",
        ui_host: "https://eu.posthog.com",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
        capture_performance: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_external_dependency_loading: true,
        advanced_disable_flags: true,
        advanced_disable_feature_flags: true,
        person_profiles: "never",
        persistence: "memory",
        disable_persistence: true,
        cross_subdomain_cookie: false,
        save_referrer: false,
        save_campaign_params: false,
        request_batching: false,
        ip: false,
        before_send(event) {
          const page = currentPath && analyticsPage(currentPath, config.paths);
          if (!active || !page || event?.event !== "$pageview") return null;
          const original = event.properties;
          const properties = {
            token: config.posthogKey,
            distinct_id: original.distinct_id,
            $device_id: original.$device_id,
            $session_id: original.$session_id,
            $insert_id: original.$insert_id,
            $lib: original.$lib,
            $lib_version: original.$lib_version,
            $process_person_profile: false,
            $geoip_disable: true,
            $current_url: page.url,
            $pathname: page.path,
            page_path: page.path,
            source: source.source,
          };
          return {
            uuid: event.uuid,
            event: event.event,
            timestamp: event.timestamp,
            properties,
          };
        },
      });
      posthog = sdk;
      posthogPage();
    })
    .catch(() => {
      // Blocked or unavailable analytics must not interrupt reading the site.
    });

  const cloudflareScript = document.createElement("script");
  cloudflareScript.async = true;
  cloudflareScript.type = "module";
  cloudflareScript.src = "https://static.cloudflareinsights.com/beacon.min.js";
  cloudflareScript.referrerPolicy = "origin";
  cloudflareScript.dataset.cfBeacon = JSON.stringify({
    token: config.cloudflareToken,
    spa: true,
  });
  document.head.append(cloudflareScript);
  scripts.push(cloudflareScript);

  return {
    page(pathname: string) {
      if (pathname === currentPath) return;
      currentPath = pathname;
      googlePage();
      posthogPage();
    },
    stop() {
      active = false;
      // Cloudflare's native unload handlers check this configuration before
      // sending. Clear it before c15t reloads, then the reload removes handlers.
      delete browser.__cfBeacon;
      browser[`ga-disable-${config.gaMeasurementId}`] = true;
      if (googleReady)
        gtag("consent", "update", { analytics_storage: "denied" });
      posthog?.opt_out_capturing();
      // The SDK's opt-out API writes a preference independently of persistence.
      // c15t owns that choice; avoid retaining a second copy after the reload.
      try {
        localStorage.removeItem(`__ph_opt_in_out_${config.posthogKey}`);
      } catch {}
      for (const script of scripts) script.remove();
      clearAnalyticsCookies();
    },
  };
}
