"use client";

import { type ReactNode, useState } from "react";
import { ChatgptIcon } from "@/components/icons/chatgpt-icon";
import { ChevronDownIcon } from "@/components/icons/chevron-down-icon";
import { ClaudeIcon } from "@/components/icons/claude-icon";
import { MarkdownFileIcon } from "@/components/icons/markdown-file-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

type DocsPageActionsProps = {
  canonicalPath: string;
  markdownPath: string;
};

function toAbsoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

function buildAiPrompt(pageUrl: string, markdownUrl: string): string {
  return [
    "Help me with this documentation page:",
    pageUrl,
    "",
    "Markdown source:",
    markdownUrl,
  ].join("\n");
}

type ActionItemProps = {
  icon: ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  href?: string;
};

function ActionItem(props: ActionItemProps) {
  const { icon, title, description, onClick, href } = props;
  return (
    <DropdownMenuItem asChild>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2"
        >
          <span className="mt-1 text-muted-foreground">{icon}</span>
          <span className="space-y-1">
            <span className="block text-sm font-medium text-foreground">
              {title}
            </span>
            <span className="block text-xs text-muted-foreground">
              {description}
            </span>
          </span>
        </a>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className="flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-2 text-left"
        >
          <span className="mt-1 text-muted-foreground">{icon}</span>
          <span className="space-y-1">
            <span className="block text-sm font-medium text-foreground">
              {title}
            </span>
            <span className="block text-xs text-muted-foreground">
              {description}
            </span>
          </span>
        </button>
      )}
    </DropdownMenuItem>
  );
}

export function DocsPageActions(props: DocsPageActionsProps) {
  const { canonicalPath, markdownPath } = props;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  const copyPageMarkdown = async () => {
    try {
      const response = await fetch(markdownPath, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to fetch markdown: ${response.status}`);
      }

      const markdown = await response.text();
      await navigator.clipboard.writeText(markdown);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1400);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  };

  const openChat = (service: "v0" | "claude" | "chatgpt") => {
    const pageUrl = toAbsoluteUrl(canonicalPath);
    const markdownUrl = toAbsoluteUrl(markdownPath);
    const prompt = buildAiPrompt(pageUrl, markdownUrl);
    const query = encodeURIComponent(prompt);
    const targets: Record<typeof service, string> = {
      v0: `https://v0.dev/chat?q=${query}`,
      claude: `https://claude.ai/new?q=${query}`,
      chatgpt: `https://chatgpt.com/?q=${query}`,
    };

    window.open(targets[service], "_blank", "noopener,noreferrer");
  };

  const copyLabel =
    copyState === "copied"
      ? "Copied"
      : copyState === "error"
        ? "Copy failed"
        : "Copy page";

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-md border border-border bg-background">
      <Button
        type="button"
        variant="ghost"
        onClick={copyPageMarkdown}
        className={cn(
          "rounded-none border-0 px-4 text-sm font-semibold text-foreground hover:bg-accent",
          copyState === "error" ? "text-red-600" : "",
        )}
      >
        {copyLabel}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            aria-label="More page actions"
            title="More page actions"
            className="rounded-none border-0 border-l border-border px-3 text-foreground hover:bg-accent"
          >
            <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[320px] p-2">
          <ActionItem
            icon={<MarkdownFileIcon className="h-5 w-5" />}
            title="View as Markdown"
            description="Open this page in Markdown"
            href={markdownPath}
          />
          <ActionItem
            icon={<ClaudeIcon className="h-5 w-5" />}
            title="Open in Claude"
            description="Ask questions about this page"
            onClick={() => openChat("claude")}
          />
          <ActionItem
            icon={<ChatgptIcon className="h-5 w-5" />}
            title="Open in ChatGPT"
            description="Ask questions about this page"
            onClick={() => openChat("chatgpt")}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
