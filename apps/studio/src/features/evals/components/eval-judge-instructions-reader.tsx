"use client";

import type { EvalJudgeIdentity } from "@kortyx/agent/evals";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
import Link from "@/components/scoped-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { judgeInstructionsDescription } from "../lib/judge-instructions";

export function EvalJudgeInstructionsReader({
  judge,
  context,
  historical,
  backHref,
}: {
  judge?: EvalJudgeIdentity;
  context: string;
  historical: boolean;
  backHref: string;
}) {
  const { presentation, navigation } = useDetailDrawer();
  const showHeader = presentation !== "drawer" || navigation?.expanded;
  const [search, setSearch] = useState("");
  const text = judge?.prompt
    ? judge.prompt.content.messages
        .map((message) => `${message.role.toUpperCase()}\n${message.content}`)
        .join("\n\n")
    : judge?.instructions;
  const query = search.trim().toLocaleLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  if (text) {
    const lower = text.toLocaleLowerCase();
    let position = 0;
    let next = query ? lower.indexOf(query) : -1;
    // Literal substring search: no regular expressions or HTML from content.
    while (next >= 0) {
      parts.push(
        { text: text.slice(position, next), match: false },
        { text: text.slice(next, next + query.length), match: true },
      );
      position = next + query.length;
      next = lower.indexOf(query, position);
    }
    parts.push({ text: text.slice(position), match: false });
  }
  const matches = parts.filter((part) => part.match).length;
  return (
    <div data-judge-instructions className="flex h-full min-h-0 flex-col">
      <div
        data-judge-instructions-context
        className="flex shrink-0 flex-col gap-3 border-b p-4"
      >
        {showHeader ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href={backHref} aria-label="Back to conversation">
                <ArrowLeft />
              </Link>
            </Button>
            <h1 className="text-sm font-semibold">Judge instructions</h1>
          </div>
        ) : null}
        {showHeader ? (
          <p className="text-xs text-muted-foreground">{context}</p>
        ) : null}
        {judge ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all font-mono text-xs">
              {judge.id} · {judge.version}
            </span>
            <Badge variant="secondary">
              {historical
                ? text
                  ? "Saved snapshot"
                  : "Saved judge"
                : "Configured instructions"}
            </Badge>
          </div>
        ) : null}
        {judge?.prompt ? (
          <p className="break-all text-xs text-muted-foreground">
            Prompt template:{" "}
            <span className="font-mono text-foreground">
              {judge.prompt.id} · v{judge.prompt.version}
            </span>
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {judgeInstructionsDescription(historical)}
        </p>
        {text ? (
          <div className="flex items-center gap-2">
            <Input
              type="search"
              aria-label="Find in judge instructions"
              placeholder="Find in instructions…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1"
            />
          </div>
        ) : null}
        {query ? (
          <output className="text-xs text-muted-foreground">
            {matches} {matches === 1 ? "match" : "matches"}
          </output>
        ) : null}
      </div>
      <div className="data-table-body-scroll min-h-0 flex-1 overflow-y-auto p-5">
        {text ? (
          <article
            aria-label="Judge instruction text"
            className="mx-auto max-w-3xl whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]"
          >
            {parts.map((part, index) =>
              part.match ? (
                <mark
                  key={`${index}:${part.text}`}
                  className="rounded-sm bg-yellow-300/70 text-neutral-950 dark:bg-yellow-300/30 dark:text-yellow-100"
                >
                  {part.text}
                </mark>
              ) : (
                part.text
              ),
            )}
          </article>
        ) : (
          <p className="text-sm text-muted-foreground">
            {historical
              ? "Instructions not recorded."
              : "Instructions are not published by the configured judge."}
          </p>
        )}
      </div>
    </div>
  );
}
