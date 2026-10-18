"use client";

import { ArrowUpRight } from "lucide-react";
import type { MouseEventHandler } from "react";
import { Button } from "@/components/ui/button";
import { studioFeature } from "@/usage/client";

export type DocumentationLinkProps = {
  href: string;
  variant?: "button" | "footer";
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function DocumentationLink({
  href,
  variant = "button",
  onClick,
}: DocumentationLinkProps) {
  return (
    <Button
      asChild
      variant={variant === "footer" ? "ghost" : "outline"}
      size="sm"
      className={variant === "footer" ? "w-full justify-between" : undefined}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          studioFeature("studio.help", {
            help_action: "documentation",
            help_placement: variant === "footer" ? "card" : "button",
          });
          onClick?.(event);
        }}
      >
        Read documentation
        <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </Button>
  );
}
