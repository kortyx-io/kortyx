"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { OverlayArrow } from "@/components/ui/overlay-arrow";

import { OVERLAY_LAYERS } from "@/lib/overlay-layers";
import { cn } from "@/lib/utils";
import { useExclusiveTooltip } from "./use-exclusive-tooltip";

function TooltipProvider({
  delayDuration = 1_000,
  skipDelayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  );
}

function Tooltip({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [open, setOpen] = useState(defaultOpen);
  const openRef = useRef(controlledOpen ?? defaultOpen);
  useEffect(() => {
    openRef.current = controlledOpen ?? open;
  }, [controlledOpen, open]);
  const dismiss = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    onOpenChange?.(false);
  }, [onOpenChange]);
  const announceOpen = useExclusiveTooltip(dismiss);
  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      open={controlledOpen ?? open}
      onOpenChange={(next) => {
        if (next) announceOpen();
        openRef.current = next;
        setOpen(next);
        onOpenChange?.(next);
      }}
      {...props}
    />
  );
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 5,
  arrowPadding = 10,
  collisionPadding = 12,
  children,
  style,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        arrowPadding={arrowPadding}
        collisionPadding={collisionPadding}
        className={cn(
          "w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-balance text-popover-foreground drop-shadow-lg fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        style={{ zIndex: OVERLAY_LAYERS.tooltip, ...style }}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow asChild>
          <OverlayArrow />
        </TooltipPrimitive.Arrow>
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
