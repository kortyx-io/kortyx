"use client";

import { unstable_AdapterContext as AdapterContext } from "nuqs/adapters/custom";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode, useContext, useMemo } from "react";
import { StudioQueryContext } from "@/lib/studio-query-context";

export function StudioQueryAdapter({ children }: { children: ReactNode }) {
  return (
    <NuqsAdapter>
      <SharedQuerySnapshot>{children}</SharedQuerySnapshot>
    </NuqsAdapter>
  );
}

function SharedQuerySnapshot({ children }: { children: ReactNode }) {
  const nextAdapterContext = useContext(AdapterContext);
  const useNextAdapter = nextAdapterContext.useAdapter;
  // Read Next's live context outside retained parallel-route payloads. Their
  // cached context can otherwise hide Back/Forward and shallow URL updates.
  const adapter = useNextAdapter([]);
  const sharedAdapter = useMemo(
    () => ({ ...nextAdapterContext, useAdapter: () => adapter }),
    [adapter, nextAdapterContext],
  );
  return (
    <StudioQueryContext.Provider value={adapter}>
      <AdapterContext.Provider value={sharedAdapter}>
        {children}
      </AdapterContext.Provider>
    </StudioQueryContext.Provider>
  );
}
