"use client";

import { X } from "lucide-react";
import { Dialog as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { OVERLAY_LAYERS } from "@/lib/overlay-layers";
import { cn } from "@/lib/utils";

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export const DialogClose = Primitive.Close;

export function DialogContent({
  children,
  className,
  showCloseButton = true,
  overlayClassName,
  ...props
}: ComponentProps<typeof Primitive.Content> & {
  showCloseButton?: boolean;
  overlayClassName?: string;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay
        className={cn("fixed inset-0 bg-black/50", overlayClassName)}
        style={{ zIndex: OVERLAY_LAYERS.modalBackdrop }}
      />
      <Primitive.Content
        {...props}
        className={cn(
          "fixed top-1/2 left-1/2 grid w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-background p-6 shadow-xl",
          className,
        )}
        style={{ zIndex: OVERLAY_LAYERS.modalSurface }}
      >
        {children}
        {showCloseButton && (
          <Primitive.Close
            aria-label="Close dialog"
            className="absolute top-4 right-4 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2"
          >
            <X className="size-4" />
          </Primitive.Close>
        )}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
