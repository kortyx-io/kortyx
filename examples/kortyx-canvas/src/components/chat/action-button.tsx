"use client";

import type { ReactNode } from "react";

export function ChatbotActionButton({
  label,
  children,
  onClick,
  disabled,
  active,
  activeClassName = "text-primary",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  activeClassName?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? activeClassName : ""
      }`}
    >
      {children}
    </button>
  );
}
