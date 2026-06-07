"use client";

import { useContext } from "react";
import {
  DiscoveryCanvasStoreContext,
  type DiscoveryCanvasStoreValue,
} from "@/providers/canvas-store";

export function useDiscoveryCanvasStore(): DiscoveryCanvasStoreValue {
  const ctx = useContext(DiscoveryCanvasStoreContext);
  if (!ctx) {
    throw new Error(
      "useDiscoveryCanvasStore must be used inside <DiscoveryCanvasStoreProvider>",
    );
  }
  return ctx;
}
