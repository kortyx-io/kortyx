"use client";

import type { ReactNode } from "react";
import { type TypewriterOptions, useTypewriter } from "@/hooks/use-typewriter";

/**
 * Drop-in typewriter for a single string that grows over time.
 *
 * Pass the current full text and a `done` flag (`true` once streaming
 * completes). Renders only the chars revealed so far. Use the
 * render-prop form (`children`) when you need to forward the revealed
 * substring into a richer renderer (e.g. markdown).
 */
type TypewriterTextProps = TypewriterOptions & {
  text: string;
  className?: string;
  children?: (revealed: string, ctx: { isCaughtUp: boolean }) => ReactNode;
};

export function TypewriterText({
  text,
  className,
  children,
  ...opts
}: TypewriterTextProps) {
  const { revealed, isCaughtUp } = useTypewriter(text.length, opts);
  const sliced = text.slice(0, revealed);
  if (children) return <>{children(sliced, { isCaughtUp })}</>;
  return <span className={className}>{sliced}</span>;
}
