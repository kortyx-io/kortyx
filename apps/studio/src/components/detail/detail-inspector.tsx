"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
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
import { detailInspectorZIndex } from "@/lib/overlay-layers";
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
  const closeRequestedRef = useRef(false);
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
    }
  }, [
    detailSurface.nestedClosing,
    detailSurface.setNestedOpen,
    open,
    selfClosing,
  ]);

  useEffect(() => {
    if (!open || (!selfClosing && !detailSurface.nestedClosing)) return;
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    setSelfClosing(true);
    // Clear selection when exit starts. Radix Presence retains the content for
    // its animation; a competing timer can reconcile a cached selection just
    // as Presence removes the portal and mount a second exit surface.
    closeRef.current();
  }, [detailSurface.nestedClosing, open, selfClosing]);

  const closing =
    detailSurface.closing || detailSurface.nestedClosing || selfClosing;
  const inspectorLayers = detailInspectorZIndex(detailSurface.layerZIndex);

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
        data-detail-inspector
        showCloseButton={false}
        overlayClassName="pointer-events-none bg-overlay/45"
        overlayStyle={{ zIndex: inspectorLayers.backdrop }}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={() => {
          // FocusScope releases the portal after Presence completes its exit.
          // Keep the close latched across intermediate URL state reconciliation.
          closeRequestedRef.current = false;
          setSelfClosing(false);
        }}
        style={{ zIndex: inspectorLayers.surface }}
        className="top-12 right-4 bottom-4 left-4 h-auto w-auto gap-0 rounded-xl border p-0 data-[state=closed]:[animation-fill-mode:forwards] sm:left-auto sm:w-[30rem] sm:max-w-none"
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
