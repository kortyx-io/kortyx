"use client";

import { XIcon } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function Drawer({ open, onOpenChange, children }: DrawerProps) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
  return <>{children}</>;
}

export function DrawerOverlay({
  open,
  onClick,
}: {
  open: boolean;
  onClick?: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-40 bg-black/40"
      onClick={onClick}
      aria-hidden="true"
    />,
    document.body,
  );
}

export function DrawerContent({
  open,
  children,
  position = "right",
}: {
  open: boolean;
  children: React.ReactNode;
  position?: "right" | "center";
}) {
  if (!open) return null;

  const positionClasses =
    position === "center"
      ? `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-lg transform transition-all duration-200 ${open ? "scale-100 opacity-100" : "scale-95 opacity-0"}`
      : `fixed inset-y-0 right-0 z-50 w-full sm:w-[28rem] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-xl transform transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`;

  return createPortal(
    <div className={positionClasses} role="dialog" aria-modal="true">
      {children}
    </div>,
    document.body,
  );
}

export function DrawerHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
      {children}
    </div>
  );
}

export function DrawerTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-semibold text-slate-800 dark:text-slate-100">
      {children}
    </div>
  );
}

export function DrawerClose({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      className="cursor-pointer text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      onClick={onClick}
    >
      <XIcon className="size-4" />
    </button>
  );
}
