"use client";
import { usePathname } from "next/navigation";
import { parseAsString } from "nuqs";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
import { DETAIL_MOTION_DURATION_MS } from "@/components/detail/detail-motion";
import type { DetailTabFamily, DetailTabId } from "@/lib/detail-tab-contract";
import { useStudioQueryState } from "@/lib/nuqs";
import { cn } from "@/lib/utils";
import { studioFeature, usageSurface } from "@/usage/client";

export type DetailTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function DetailTabs<F extends DetailTabFamily | undefined = undefined>({
  tabs,
  queryKey = "tab",
}: {
  family?: F;
  tabs: (Omit<DetailTab, "id"> & {
    id: NoInfer<F extends DetailTabFamily ? DetailTabId<F> : string>;
  })[];
  queryKey?: string;
}) {
  const pathname = usePathname();
  const initialTab = tabs[0]?.id ?? "";
  const [requestedTab, setRequestedTab] = useStudioQueryState(
    queryKey,
    parseAsString.withDefault(initialTab),
  );
  const selected = tabs.find((tab) => tab.id === requestedTab) ?? tabs[0];
  const detailDrawer = useDetailDrawer();
  const [leavingTabId, setLeavingTabId] = useState<string | null>(null);
  const releaseTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current);
      }
    },
    [],
  );

  const changeTab = (nextId: string) => {
    if (nextId === selected?.id) return;
    studioFeature("studio.inspect", {
      surface: usageSurface(pathname),
      tab: nextId,
      action: "select",
    });
    if (detailDrawer.nestedOpen) {
      setLeavingTabId(selected?.id ?? null);
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current);
      }
      releaseTimerRef.current = window.setTimeout(() => {
        releaseTimerRef.current = null;
        setLeavingTabId(null);
      }, DETAIL_MOTION_DURATION_MS);
      detailDrawer.requestNestedClose();
    }
    void setRequestedTab(nextId === initialTab ? null : nextId, {
      shallow: true,
    });
  };

  const renderedTabs = tabs.filter(
    (tab) => tab.id === selected?.id || tab.id === leavingTabId,
  );

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <div
        data-page-help="tabs"
        className="data-table-header-scroll z-10 flex shrink-0 gap-1 overflow-x-auto border-b bg-background px-3 @lg:px-6"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-detail-tab={tab.id}
            type="button"
            onClick={() => changeTab(tab.id)}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-2 py-2.5 text-xs font-medium transition-colors",
              tab.id === selected?.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-hidden transition-[padding] duration-300 ease-in-out",
          detailDrawer.supportsSplitInspector &&
            detailDrawer.nestedOpen &&
            !detailDrawer.isMobile &&
            "lg:pr-[30rem]",
        )}
      >
        {renderedTabs.map((tab) => (
          <div
            key={tab.id}
            data-detail-tab-content={tab.id}
            role="tabpanel"
            aria-hidden={tab.id !== selected?.id}
            className={cn(
              "data-table-body-scroll h-full min-h-0 overflow-auto",
              tab.id !== selected?.id && "hidden",
            )}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
