"use client";
import type { ReactNode } from "react";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
export function PromptWorkspace({ children }: { children: ReactNode }) {
  const detailSurface = useDetailDrawer();
  const split =
    detailSurface.supportsSplitInspector &&
    detailSurface.nestedOpen &&
    !detailSurface.isMobile;
  return (
    <div
      className={`min-h-0 flex-1 transition-[padding] duration-300 ease-in-out ${split ? "lg:pr-[30rem]" : ""}`}
    >
      <div className="@container/prompt-detail flex h-full min-h-0 flex-col">
        {children}
      </div>
    </div>
  );
}
