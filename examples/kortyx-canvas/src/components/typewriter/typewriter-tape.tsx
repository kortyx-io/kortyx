"use client";

import type { ReactNode } from "react";
import { type TypewriterOptions, useTypewriter } from "@/hooks/use-typewriter";

/**
 * Ordered multi-segment typewriter for streams that arrive in pieces from
 * multiple producers (e.g. several agent nodes streaming into the same
 * assistant message, with thinking-marker pieces interleaved between
 * text segments).
 *
 * Internally builds a single "tape" by concatenating all text segments
 * end-to-end and assigning every segment + marker an offset on that
 * tape. A single `useTypewriter` instance drives reveal across the whole
 * tape — so segment N never starts typing until segment N-1 is fully
 * revealed, and marker pieces "pop in" the moment the cursor passes them.
 *
 * Segments:
 *   - `{ kind: "text", key, content }`   — text reveals char-by-char.
 *   - `{ kind: "marker", key, render }`  — non-text UI (thinking pill,
 *                                          divider, etc.) renders fully
 *                                          once the cursor reaches it.
 */

export type TapeSegment =
  | { kind: "text"; key: string; content: string }
  | { kind: "marker"; key: string; render: () => ReactNode };

export type TypewriterTapeProps = TypewriterOptions & {
  segments: TapeSegment[];
  /**
   * How each text segment renders. Receives the currently-revealed slice
   * of that segment plus a context object with the segment key and
   * whether THIS segment is fully typed out. Useful for drawing a
   * trailing cursor only on the last in-progress segment.
   */
  renderText: (
    text: string,
    ctx: { key: string; isLast: boolean; isCaughtUp: boolean },
  ) => ReactNode;
};

type LaidOut =
  | { kind: "text"; key: string; content: string; offset: number; end: number }
  | { kind: "marker"; key: string; render: () => ReactNode; offset: number };

function layout(segments: TapeSegment[]): {
  items: LaidOut[];
  totalChars: number;
} {
  let offset = 0;
  const items: LaidOut[] = segments.map((s) => {
    if (s.kind === "text") {
      const start = offset;
      offset += s.content.length;
      return { ...s, offset: start, end: offset };
    }
    return { ...s, offset };
  });
  return { items, totalChars: offset };
}

export function TypewriterTape({
  segments,
  renderText,
  ...opts
}: TypewriterTapeProps) {
  const { items, totalChars } = layout(segments);
  const { revealed } = useTypewriter(totalChars, opts);

  // Index of the last text item we'll actually render this frame — used
  // to mark the trailing in-progress text bubble for the consumer.
  let lastVisibleTextIdx = -1;
  items.forEach((item, i) => {
    if (item.kind === "text" && revealed > item.offset) lastVisibleTextIdx = i;
  });

  return (
    <>
      {items.map((item, i) => {
        if (item.kind === "marker") {
          if (revealed < item.offset) return null;
          return <span key={item.key}>{item.render()}</span>;
        }
        const chars = Math.max(
          0,
          Math.min(revealed - item.offset, item.content.length),
        );
        // Skip segments that haven't started yet so they don't render as
        // empty bubbles.
        if (chars === 0) return null;
        return renderText(item.content.slice(0, chars), {
          key: item.key,
          isLast: i === lastVisibleTextIdx,
          isCaughtUp: revealed >= item.end,
        });
      })}
    </>
  );
}
