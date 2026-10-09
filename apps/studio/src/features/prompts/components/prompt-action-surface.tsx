"use client";
import { type ComponentProps, type ReactNode, useRef } from "react";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/** Keep substantial workflows in inspectors, and short actions in platform dialogs. */
export function PromptActionSurface({
  modal = false,
  wide = false,
  busy = false,
  confirmation = false,
  actions,
  ...props
}: ComponentProps<typeof DetailInspectorDrawer> & {
  modal?: boolean;
  wide?: boolean;
  busy?: boolean;
  confirmation?: boolean;
  actions?: ReactNode;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  if (!modal)
    return (
      <DetailInspectorDrawer {...props}>
        {props.children}
        {actions && <div className="px-5 pb-5">{actions}</div>}
      </DetailInspectorDrawer>
    );
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !busy) props.onClose();
      }}
    >
      <DialogContent
        ref={content}
        className={`flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onEscapeKeyDown={(event) => {
          event.stopPropagation();
          if (busy) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          const active = document.activeElement;
          if (active instanceof HTMLElement) {
            const triggerId = active
              .closest('[role="menu"]')
              ?.getAttribute("aria-labelledby");
            returnFocus.current =
              (triggerId ? document.getElementById(triggerId) : null) ?? active;
          }
          if (confirmation) {
            event.preventDefault();
            cancel.current?.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          // Radix restores focus after unmount. Do not steal it from a menu or
          // another control the user has already opened in that frame.
          event.preventDefault();
          // A newly mounted menu may not have received autofocus yet. Restoring
          // the old trigger in that gap dismisses the menu as an outside focus.
          if (document.querySelector('[role="menu"][data-state="open"]'))
            return;
          const active = document.activeElement;
          if (active === document.body || content.current?.contains(active)) {
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }
        }}
      >
        <div className="space-y-1 border-b px-5 py-4 pr-12">
          <DialogTitle className="text-sm font-semibold">
            {props.title}
          </DialogTitle>
          <DialogDescription className="break-words text-xs text-muted-foreground">
            {props.description}
          </DialogDescription>
        </div>
        <div className="min-h-0 overflow-y-auto">{props.children}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3">
          <Button
            ref={cancel}
            data-action-cancel
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={props.onClose}
          >
            {wide ? "Close" : "Cancel"}
          </Button>
          {actions}
        </div>
      </DialogContent>
    </Dialog>
  );
}
