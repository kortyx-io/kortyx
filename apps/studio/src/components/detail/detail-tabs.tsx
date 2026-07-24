"use client";

import { parseAsString } from "nuqs";
import { type ReactNode, useMemo } from "react";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
import { useStudioQueryStates } from "@/lib/nuqs";
import { cn } from "@/lib/utils";

export type DetailTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function DetailTabs({ tabs }: { tabs: DetailTab[] }) {
  const initialTab = tabs[0]?.id ?? "";
  const parsers = useMemo(
    () => ({
      tab: parseAsString.withDefault(initialTab),
    }),
    [initialTab],
  );
  const [{ tab: requestedTab }, setQueryStates] = useStudioQueryStates(
    parsers,
    { shallow: true },
  );
  const selected = tabs.find((tab) => tab.id === requestedTab) ?? tabs[0];
  const detailDrawer = useDetailDrawer();

  const changeTab = (nextId: string) => {
    if (nextId === selected?.id) return;
    if (detailDrawer.nestedOpen) {
      detailDrawer.requestNestedClose();
    }
    void setQueryStates({ tab: nextId === initialTab ? null : nextId });
  };

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
        {selected && (
          <div
            key={selected.id}
            role="tabpanel"
            className="h-full min-h-0 overflow-auto"
          >
            {selected.content}
          </div>
        )}
      </div>
    </div>
  );
}
