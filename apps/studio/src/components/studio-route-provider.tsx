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
  return <RouteScope.Provider value={scope}>{children}</RouteScope.Provider>;
}
