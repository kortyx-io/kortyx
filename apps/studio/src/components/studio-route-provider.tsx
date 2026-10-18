"use client";
import { createContext, type ReactNode, useContext } from "react";
import type { StudioRouteScope } from "@/lib/studio-routing";

const RouteScope = createContext<StudioRouteScope | undefined>(undefined);
export const useStudioRouteScope = () => useContext(RouteScope);
export function StudioRouteProvider({
  scope,
  children,
}: {
  scope?: StudioRouteScope | undefined;
  children: ReactNode;
}) {
  // Retained drawers and keepPreviousData belong to one workspace. Never carry
  // them into another project while its server/client data is still arriving.
  return (
    <RouteScope.Provider
      key={`${scope?.sampleProject ? "sample" : "real"}:${scope?.organizationPublicId ?? ""}:${scope?.projectPublicId ?? ""}`}
      value={scope}
    >
      {children}
    </RouteScope.Provider>
  );
}
