"use client";

import { type ComponentProps, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { OVERLAY_LAYERS } from "@/lib/overlay-layers";
import { cn } from "@/lib/utils";

/** Keep an actionable notice in the active modal's focus and accessibility scope. */
export function FloatingNotice({
  className,
  style,
  ...props
}: ComponentProps<"aside">) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const sync = () => {
      const dialogs = document.querySelectorAll<HTMLElement>(
        '[data-slot="dialog-content"][data-state="open"], [data-slot="sheet-content"][data-state="open"][data-notice-modal="true"]',
      );
      setContainer(dialogs[dialogs.length - 1] ?? document.body);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    sync();
    return () => observer.disconnect();
  }, []);
  return container
    ? createPortal(
        <aside
          {...props}
          style={{
            ...style,
            zIndex: OVERLAY_LAYERS.notice,
            pointerEvents: "auto",
          }}
          className={cn(
            "fixed inset-x-4 bottom-4 mx-auto flex max-w-xl flex-col gap-3 rounded-lg border bg-background p-5 shadow-lg",
            className,
          )}
        />,
        container,
      )
    : null;
}
