"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
import { DETAIL_MOTION_DURATION_MS } from "@/components/detail/detail-motion";
import { Button } from "@/components/ui/button";
import { OverflowText } from "@/components/ui/overflow-tooltip";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function DetailInspectorDrawer({
  open,
  onClose,
  title,
  description,
  badges,
  closeLabel,
  bodyClassName,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  badges?: ReactNode;
  closeLabel: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const detailSurface = useDetailDrawer();
  const closeRef = useRef(onClose);
  const ownsSplitPaneRef = useRef(false);
  const retainedContentRef = useRef({
    badges,
    bodyClassName,
    children,
    description,
    title,
  });
  const [selfClosing, setSelfClosing] = useState(false);
  closeRef.current = onClose;
  if (open) {
    retainedContentRef.current = {
      badges,
      bodyClassName,
      children,
      description,
      title,
    };
  }
  const retained = open
    ? { badges, bodyClassName, children, description, title }
    : retainedContentRef.current;

  useEffect(
    () => () => {
      if (ownsSplitPaneRef.current) {
        detailSurface.setNestedOpen(false);
      }
    },
    [detailSurface.setNestedOpen],
  );

  useEffect(() => {
    if (open && !selfClosing && !detailSurface.nestedClosing) {
      ownsSplitPaneRef.current = true;
      detailSurface.setNestedOpen(true);
    } else if (!open && ownsSplitPaneRef.current) {
      ownsSplitPaneRef.current = false;
      detailSurface.setNestedOpen(false);
      setSelfClosing(false);
    }
  }, [
    detailSurface.nestedClosing,
    detailSurface.setNestedOpen,
    open,
    selfClosing,
  ]);

  useEffect(() => {
    if (!open || (!selfClosing && !detailSurface.nestedClosing)) return;
    const timer = window.setTimeout(() => {
      closeRef.current();
    }, DETAIL_MOTION_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [detailSurface.nestedClosing, open, selfClosing]);

  const closing =
    detailSurface.closing || detailSurface.nestedClosing || selfClosing;

  return (
    <Sheet
      modal={false}
      open={open && !closing}
      onOpenChange={(nextOpen) => {
        if (nextOpen || !open || closing) return;
        setSelfClosing(true);
        detailSurface.requestNestedClose();
      }}
    >
      <SheetContent
        showCloseButton={false}
        overlayClassName="pointer-events-none z-[60] bg-overlay/45"
        overlayStyle={{ zIndex: detailSurface.layerZIndex + 5 }}
        onInteractOutside={(event) => event.preventDefault()}
        style={{ zIndex: detailSurface.layerZIndex + 10 }}
        className="top-12 right-4 bottom-4 left-4 z-[70] h-auto w-auto gap-0 rounded-xl border p-0 sm:left-auto sm:w-[30rem] sm:max-w-none"
      >
        <SheetHeader className="h-14 shrink-0 justify-center gap-0.5 border-b px-4 py-0">
          <div className="flex min-w-0 items-center gap-2">
            <SheetTitle
              aria-label={retained.title}
              className="min-w-0 flex-1 text-sm"
            >
              <OverflowText ariaLabel={retained.title}>
                {retained.title}
              </OverflowText>
            </SheetTitle>
            {retained.badges}
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={closeLabel}
              >
                <X />
              </Button>
            </SheetClose>
          </div>
          <SheetDescription className="min-w-0 text-xs">
            <OverflowText ariaLabel={retained.description}>
              {retained.description}
            </OverflowText>
          </SheetDescription>
        </SheetHeader>
        <div
          className={cn(
            "data-table-body-scroll min-h-0 flex-1 overflow-y-auto",
            retained.bodyClassName,
          )}
        >
          {retained.children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
