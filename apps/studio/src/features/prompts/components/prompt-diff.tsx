"use client";
import { canonicalPromptJson, type PromptContent } from "@kortyx/prompts";
import { diffLines, diffWordsWithSpace } from "diff";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { editorClass } from "./prompt-fields";

function readable(content: PromptContent) {
  return (
    `FORMAT\n${content.format}\n\n` +
    content.messages
      .map((message) => `${message.role.toUpperCase()}\n${message.content}`)
      .join("\n\n") +
    `\n\nCONFIGURATION\n${JSON.stringify(content.config, null, 2)}\n\nINPUT SCHEMA\n${JSON.stringify(content.variablesSchema, null, 2)}\n\nCONFIGURATION SCHEMA\n${JSON.stringify(content.configSchema, null, 2)}\n\nDEPENDENCIES\n${JSON.stringify(content.dependencies, null, 2)}`
  );
}
export function PromptDiff({
  before,
  after,
  beforeLabel,
  afterLabel,
  saving,
  working,
  onClose,
  onAccept,
  selectors,
}: {
  before: PromptContent;
  after: PromptContent;
  beforeLabel: string;
  afterLabel: string;
  saving?: boolean;
  working?: boolean;
  onClose: () => void;
  onAccept?: (note: string) => void;
  selectors?: import("react").ReactNode;
}) {
  const [note, setNote] = useState("");
  const rows = useMemo(() => {
    const chunks = diffLines(readable(before), readable(after), {
      timeout: 1000,
    }) ?? [
      { value: readable(before), removed: true },
      { value: readable(after), added: true },
    ];
    const result: {
      left: string | null;
      right: string | null;
      changed: boolean;
    }[] = [];
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]!;
      const lines = chunk.value.replace(/\n$/, "").split("\n");
      if (!chunk.added && !chunk.removed) {
        for (const line of lines)
          result.push({ left: line, right: line, changed: false });
        continue;
      }
      const following = chunks[index + 1];
      const right =
        chunk.removed && following?.added
          ? following.value.replace(/\n$/, "").split("\n")
          : chunk.added
            ? lines
            : [];
      const left = chunk.removed ? lines : [];
      if (chunk.removed && following?.added) index++;
      for (let line = 0; line < Math.max(left.length, right.length); line++)
        result.push({
          left: left[line] ?? null,
          right: right[line] ?? null,
          changed: true,
        });
    }
    return result;
  }, [before, after]);
  const unchanged = canonicalPromptJson(before) === canonicalPromptJson(after);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !working) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <header className="shrink-0 space-y-1 border-b p-5 pr-12">
          <DialogTitle className="text-sm font-semibold">
            {saving ? "Review & save version" : "Compare versions"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {saving
              ? "Confirm the exact changes before creating an immutable version."
              : "Compare messages, configuration and contracts."}
          </DialogDescription>
        </header>
        {selectors && (
          <div className="grid shrink-0 grid-cols-2 gap-3 border-b p-4">
            {selectors}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="sticky top-0 z-10 grid grid-cols-2 border-b bg-background text-xs font-medium">
            <div className="min-w-0 truncate border-r px-4 py-3">
              {beforeLabel}
            </div>
            <div className="min-w-0 truncate px-4 py-3">{afterLabel}</div>
          </div>
          <div className="divide-y divide-border/40 font-mono text-[11px] leading-5">
            {rows.map((row, index) => {
              const words =
                row.changed && row.left !== null && row.right !== null
                  ? diffWordsWithSpace(row.left, row.right, { timeout: 100 })
                  : undefined;
              return (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-2">
                  <div
                    className={`min-w-0 whitespace-pre-wrap break-words border-r px-4 py-1 ${row.changed && row.left !== null ? "bg-red-500/10 text-red-800 dark:text-red-300" : row.changed ? "hidden bg-muted/30 sm:block" : "text-muted-foreground"}`}
                  >
                    <span aria-hidden="true" className="mr-2 opacity-60">
                      {row.changed ? "−" : " "}
                    </span>
                    {words
                      ? words
                          .filter((word) => !word.added)
                          .map((word, position) => (
                            <span
                              key={position}
                              className={
                                word.removed ? "rounded-sm bg-red-500/20" : ""
                              }
                            >
                              {word.value}
                            </span>
                          ))
                      : row.left}
                  </div>
                  <div
                    className={`min-w-0 whitespace-pre-wrap break-words px-4 py-1 ${!row.changed ? "hidden sm:block text-muted-foreground" : row.right !== null ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "hidden bg-muted/30 sm:block"}`}
                  >
                    <span aria-hidden="true" className="mr-2 opacity-60">
                      {row.changed ? "+" : " "}
                    </span>
                    {words
                      ? words
                          .filter((word) => !word.removed)
                          .map((word, position) => (
                            <span
                              key={position}
                              className={
                                word.added ? "rounded-sm bg-emerald-500/20" : ""
                              }
                            >
                              {word.value}
                            </span>
                          ))
                      : row.right}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {saving && (
          <div className="shrink-0 space-y-2 border-t p-4">
            <label htmlFor="prompt-change-note" className="text-xs font-medium">
              Change note{" "}
              <span className="text-muted-foreground">required</span>
            </label>
            <textarea
              id="prompt-change-note"
              className={`${editorClass} min-h-16 max-h-32 font-sans`}
              maxLength={2000}
              placeholder="What changed, and why?"
              value={note}
              disabled={working}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        )}
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t p-4">
          <p className="w-full text-xs text-muted-foreground sm:w-auto">
            {unchanged ? "No executable changes" : "− Removed  ·  + Added"}
          </p>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={working}
              onClick={onClose}
            >
              Cancel
            </Button>
            {saving && (
              <Button
                size="sm"
                disabled={working || !note.trim() || unchanged}
                onClick={() => onAccept?.(note.trim())}
              >
                {working ? "Saving…" : "Accept & save version"}
              </Button>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
