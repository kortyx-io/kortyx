"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { TocHeading } from "@/lib/utils/extract-toc";

type DocsOnThisPageProps = {
  items: TocHeading[];
};

export function DocsOnThisPage(props: DocsOnThisPageProps) {
  const { items } = props;
  const [activeId, setActiveId] = useState<string | null>(null);

  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  useEffect(() => {
    if (itemIds.length === 0) return;

    const fromHash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (fromHash && itemIds.includes(fromHash)) {
      setActiveId(fromHash);
      const hashTarget = document.getElementById(fromHash);
      if (hashTarget) {
        hashTarget.scrollIntoView({ block: "start" });
      }
    }

    const onScroll = () => {
      let nextActive: string | null = null;
      for (const id of itemIds) {
        const element = document.getElementById(id);
        if (!element) continue;
        const top = element.getBoundingClientRect().top;
        if (top <= 120) {
          nextActive = id;
        } else {
          break;
        }
      }
      setActiveId(nextActive ?? itemIds[0] ?? null);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [itemIds]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No headings</p>;
  }

  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className={cn(
              "block text-sm transition-colors",
              item.level === 3 ? "pl-4" : "",
              activeId === item.id
                ? "font-medium text-primary dark:text-blue-300"
                : "text-muted-foreground hover:text-primary pr-1 dark:hover:text-blue-200",
            )}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ul>
  );
}
