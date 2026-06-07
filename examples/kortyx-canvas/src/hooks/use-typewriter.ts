"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveal-count typewriter hook.
 *
 * Drives a `requestAnimationFrame` loop that advances an internal "revealed
 * characters" counter toward `targetLength`. The advance rate is adaptive:
 *
 *   - When the buffer (pending chars = `targetLength - revealed`) is small,
 *     rate is `baseRate` (comfortable reading speed).
 *   - As the buffer grows, rate linearly ramps up toward `maxRate` so the
 *     typewriter doesn't fall behind a fast stream.
 *   - When `done` is `true` (no more chars expected), rate drops back to
 *     `baseRate` regardless of buffer size — so the user sees the tail
 *     of the message type out at reading speed instead of flushing at
 *     full speed.
 *
 * Returns the integer `revealed` count plus an `isCaughtUp` flag. Caller
 * slices its source string by `revealed` to render. Works equally well
 * with a single concatenated tape across multiple segments — keep adding
 * to the source string and bump `targetLength`; ordering is automatic.
 *
 * Honors `prefers-reduced-motion`: when set, the hook reveals everything
 * immediately and skips the animation loop entirely.
 */

export type TypewriterOptions = {
  /** Steady-state chars/second when caught up. Default 70. */
  baseRate?: number;
  /** Top chars/second when the buffer is at or above `catchupAt`. Default 350. */
  maxRate?: number;
  /** Buffer length (chars) at which rate hits `maxRate`. Default 120. */
  catchupAt?: number;
  /**
   * Set to `true` once no more characters are expected. Drains the
   * remaining buffer at `baseRate` (no catch-up acceleration).
   */
  done?: boolean;
};

export type UseTypewriterResult = {
  /** Integer number of characters currently revealed. */
  revealed: number;
  /** True once `revealed >= targetLength`. */
  isCaughtUp: boolean;
};

const DEFAULTS = {
  baseRate: 55,
  maxRate: 260,
  catchupAt: 100,
} as const;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useTypewriter(
  targetLength: number,
  opts: TypewriterOptions = {},
): UseTypewriterResult {
  const baseRate = opts.baseRate ?? DEFAULTS.baseRate;
  const maxRate = opts.maxRate ?? DEFAULTS.maxRate;
  const catchupAt = opts.catchupAt ?? DEFAULTS.catchupAt;
  const done = opts.done ?? false;

  // Refs so the rAF loop always sees latest values without re-subscribing.
  const targetRef = useRef(targetLength);
  const doneRef = useRef(done);
  const ratesRef = useRef({ baseRate, maxRate, catchupAt });
  targetRef.current = targetLength;
  doneRef.current = done;
  ratesRef.current = { baseRate, maxRate, catchupAt };

  const revealedFloatRef = useRef(0);
  const revealedIntRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);

  const [revealed, setRevealed] = useState(0);

  // If the target shrunk (e.g. a new message replaced the previous one),
  // snap back to the start so the new content types in from zero.
  useEffect(() => {
    if (targetLength < revealedIntRef.current) {
      revealedFloatRef.current = 0;
      revealedIntRef.current = 0;
      lastTsRef.current = null;
      setRevealed(0);
    }
  }, [targetLength]);

  useEffect(() => {
    // Reduced-motion users get the full text immediately and we skip the
    // rAF loop entirely — no animation, no cost.
    if (prefersReducedMotion()) {
      revealedFloatRef.current = targetRef.current;
      revealedIntRef.current = targetRef.current;
      setRevealed(targetRef.current);
      return;
    }

    let rafId = 0;
    let cancelled = false;

    const tick = (ts: number) => {
      if (cancelled) return;
      if (lastTsRef.current == null) lastTsRef.current = ts;
      // Clamp big timestamp gaps (tab was inactive, debugger paused, etc.)
      // so we don't flush 10s of buffer in one frame.
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.1);
      lastTsRef.current = ts;

      const target = targetRef.current;
      const r = revealedFloatRef.current;
      const buffer = target - r;

      if (buffer > 0) {
        const { baseRate: br, maxRate: mr, catchupAt: ca } = ratesRef.current;
        const ratio = ca > 0 ? Math.min(buffer / ca, 1) : 1;
        const rate = doneRef.current ? br : br + (mr - br) * ratio;
        const next = Math.min(target, r + rate * dt);
        revealedFloatRef.current = next;
        const flooredNext = Math.floor(next);
        if (flooredNext !== revealedIntRef.current) {
          revealedIntRef.current = flooredNext;
          setRevealed(flooredNext);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      lastTsRef.current = null;
    };
  }, []);

  return {
    revealed,
    isCaughtUp: revealed >= targetLength,
  };
}
