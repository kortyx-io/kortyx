"use client";

import { useEffect, useState } from "react";

const VISIBILITY_SCROLL_THRESHOLD = 320;
const CIRCLE_SIZE = 20;
const CIRCLE_R = 7;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_R;

function getScrollProgress(): number {
  if (typeof window === "undefined") return 0;
  const { scrollY } = window;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  if (maxScroll <= 0) return 0;
  return Math.min(1, scrollY / maxScroll);
}

type ScrollToTopButtonProps = {
  variant?: "floating" | "inline" | "circle";
};

export function ScrollToTopButton(props: ScrollToTopButtonProps) {
  const { variant = "floating" } = props;
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      setIsVisible(window.scrollY > VISIBILITY_SCROLL_THRESHOLD);
      setScrollProgress(getScrollProgress());
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (variant === "circle") {
    if (!isVisible) return null;
    const offset = CIRCLE_CIRCUMFERENCE * (1 - scrollProgress);
    return (
      <button
        type="button"
        aria-label="Scroll to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary dark:hover:text-blue-200"
      >
        Scroll to top
        <span className="flex shrink-0">
          <svg
            width={CIRCLE_SIZE}
            height={CIRCLE_SIZE}
            viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`}
            className="-rotate-90"
            aria-hidden
          >
            <title>Scroll progress</title>
            <circle
              cx={CIRCLE_SIZE / 2}
              cy={CIRCLE_SIZE / 2}
              r={CIRCLE_R}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="opacity-20"
            />
            <circle
              cx={CIRCLE_SIZE / 2}
              cy={CIRCLE_SIZE / 2}
              r={CIRCLE_R}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray={CIRCLE_CIRCUMFERENCE}
              strokeDashoffset={offset}
            />
          </svg>
        </span>
      </button>
    );
  }

  if (variant === "inline") {
    if (!isVisible) return null;

    return (
      <button
        type="button"
        aria-label="Scroll to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-primary dark:hover:text-blue-200"
      >
        Scroll to top
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label="Scroll to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed right-6 bottom-6 z-50 cursor-pointer rounded-full border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-lg transition-all hover:bg-accent ${
        isVisible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      Scroll to top
    </button>
  );
}
