"use client";

import { parseAsString } from "nuqs";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
import { DETAIL_MOTION_DURATION_MS } from "@/components/detail/detail-motion";
import { useStudioQueryState } from "@/lib/nuqs";
import { cn } from "@/lib/utils";

export type DetailTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function DetailTabs({
  tabs,
  queryKey = "tab",
}: {
  tabs: DetailTab[];
  queryKey?: string;
}) {
  const initialTab = tabs[0]?.id ?? "";
  const [requestedTab, setRequestedTab] = useStudioQueryState(
    queryKey,
    parseAsString.withDefault(initialTab).withOptions({ shallow: true }),
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
    void setRequestedTab(nextId === initialTab ? null : nextId);
  };

  const renderedTabs = tabs.filter(
    (tab) => tab.id === selected?.id || tab.id === leavingTabId,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="z-10 flex shrink-0 gap-1 overflow-x-auto border-b bg-background px-4 md:px-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => changeTab(tab.id)}
            className={cn(
              "border-b-2 px-2 py-3 text-xs font-medium transition-colors",
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
            role="tabpanel"
            aria-hidden={tab.id !== selected?.id}
            className={cn(
              "h-full min-h-0 overflow-auto",
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
