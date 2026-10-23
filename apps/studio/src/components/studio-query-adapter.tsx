"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type unstable_AdapterInterface as AdapterInterface,
  unstable_createAdapterProvider as createAdapterProvider,
  renderQueryString,
} from "nuqs/adapters/custom";
import { NuqsAdapter } from "nuqs/adapters/react";
import { type ReactNode, useCallback, useContext, useMemo } from "react";
import { StudioQueryContext } from "@/lib/studio-query-context";

const SharedAdapter = createAdapterProvider(function useSharedAdapter() {
  const adapter = useContext(StudioQueryContext);
  if (!adapter) throw new Error("Studio query snapshot is unavailable");
  return adapter;
});

export function StudioQueryAdapter({ children }: { children: ReactNode }) {
  // Read Next's live context outside retained parallel-route payloads. Their
  // cached context can otherwise hide Back/Forward and shallow URL updates.
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const updateUrl = useCallback<AdapterInterface["updateUrl"]>(
    (params, options) => {
      const url = new URL(window.location.href);
      url.search = renderQueryString(params);
      if (options.shallow) {
        window.history[
          options.history === "push" ? "pushState" : "replaceState"
        ](null, "", url);
        if (options.scroll) window.scrollTo(0, 0);
      } else {
        router[options.history === "push" ? "push" : "replace"](url.href, {
          scroll: options.scroll,
        });
      }
    },
    [router],
  );
  const adapter = useMemo<AdapterInterface>(
    () => ({ pathname, searchParams: new URLSearchParams(search), updateUrl }),
    [pathname, search, updateUrl],
  );
  return (
    // The React adapter supplies Nuqs' popstate queue cleanup. The custom
    // adapter keeps Next navigation for server-backed updates and shares one
    // root snapshot with every retained drawer using the supported API.
    <NuqsAdapter serverSearch={search}>
      <StudioQueryContext.Provider value={adapter}>
        <SharedAdapter>{children}</SharedAdapter>
      </StudioQueryContext.Provider>
    </NuqsAdapter>
  );
}
