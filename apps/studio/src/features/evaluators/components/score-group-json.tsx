"use client";

import { jsonLanguage } from "@codemirror/lang-json";
import { highlightTree, tagHighlighter, tags } from "@lezer/highlight";
import { type ReactNode, useMemo } from "react";
import syntax from "@/components/ui/json-code-editor.module.css";
import { cn } from "@/lib/utils";

const highlighting = tagHighlighter([
  { tag: tags.propertyName, class: syntax.property },
  { tag: tags.string, class: syntax.string },
  { tag: tags.number, class: syntax.number },
  { tag: [tags.bool, tags.null], class: syntax.literal },
  { tag: [tags.bracket, tags.separator], class: syntax.punctuation },
]);

export function ScoreGroupJson({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const content = useMemo(() => {
    const parts: ReactNode[] = [];
    let position = 0;
    highlightTree(
      jsonLanguage.parser.parse(value),
      highlighting,
      (from, to, className) => {
        if (from > position) parts.push(value.slice(position, from));
        parts.push(
          <span key={from} className={className}>
            {value.slice(from, to)}
          </span>,
        );
        position = to;
      },
    );
    if (position < value.length) parts.push(value.slice(position));
    return parts;
  }, [value]);

  return (
    <section
      aria-label={label}
      data-score-group-code
      className={cn(
        syntax.viewer,
        "min-w-0 shrink-0 overflow-hidden rounded-md border bg-muted/20 p-3 font-mono text-xs leading-5",
      )}
    >
      <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        <code>{content}</code>
      </pre>
    </section>
  );
}
