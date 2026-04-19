import GithubSlugger from "github-slugger";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rewriteMarkdownHref } from "@/lib/docs";
import { cn } from "@/lib/utils/cn";
import { extractCodeFileLabel } from "@/lib/utils/extract-code-file-label";
import { extractCodeTabLabel } from "@/lib/utils/extract-code-tab-label";
import { extractLeadingFileComment } from "@/lib/utils/extract-leading-file-comment";
import { extractText } from "@/lib/utils/extract-text";
import { parseCodeTabGroups } from "@/lib/utils/parse-code-tab-groups";
import { DocsCodeBlock, type DocsCodeBlockEntry } from "./docs-code-block";
import { DocsHeadingAnchorButton } from "./docs-heading-anchor-button";

type MarkdownCodeNode = {
  data?: { meta?: string | null };
  position?: { start?: { line?: number } };
};

type DocsMarkdownContentProps = {
  content: string;
  version: string;
  currentRelativeFile: string;
  versionDocs: Parameters<typeof rewriteMarkdownHref>[0]["versionDocs"];
  lastUpdatedAt?: string | null;
  lastUpdatedReferenceAt?: string | null;
};

const formatRelativeDate = (
  updatedAt: string,
  referenceAt: string,
): string | null => {
  const updatedTime = new Date(updatedAt).getTime();
  const referenceTime = new Date(referenceAt).getTime();
  if (!Number.isFinite(updatedTime) || !Number.isFinite(referenceTime)) {
    return null;
  }

  const diffMs = Math.max(referenceTime - updatedTime, 0);
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "always" });

  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.round(diffMs / minuteMs));
    return rtf.format(-minutes, "minute");
  }

  if (diffMs < dayMs) {
    const hours = Math.max(1, Math.round(diffMs / hourMs));
    return rtf.format(-hours, "hour");
  }

  if (diffMs < monthMs) {
    const days = Math.max(1, Math.round(diffMs / dayMs));
    return rtf.format(-days, "day");
  }

  if (diffMs < yearMs) {
    const months = Math.max(1, Math.round(diffMs / monthMs));
    return rtf.format(-months, "month");
  }

  const years = Math.max(1, Math.round(diffMs / yearMs));
  return rtf.format(-years, "year");
};

export function DocsMarkdownContent(props: DocsMarkdownContentProps) {
  const {
    content,
    version,
    currentRelativeFile,
    versionDocs,
    lastUpdatedAt,
    lastUpdatedReferenceAt,
  } = props;
  const headingSlugger = new GithubSlugger();
  const codeTabGroups = parseCodeTabGroups(content);
  const formattedLastUpdated = lastUpdatedAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date(lastUpdatedAt))
    : null;
  const relativeLastUpdated =
    lastUpdatedAt && lastUpdatedReferenceAt
      ? formatRelativeDate(lastUpdatedAt, lastUpdatedReferenceAt)
      : null;
  const lastUpdatedLabel =
    formattedLastUpdated && relativeLastUpdated
      ? `Updated ${relativeLastUpdated} • ${formattedLastUpdated}`
      : formattedLastUpdated
        ? `Updated ${formattedLastUpdated}`
        : null;
  let h1Count = 0;

  const toEntry = (args: {
    language: string;
    meta?: string;
    code: string;
  }): DocsCodeBlockEntry => {
    const { language, meta, code } = args;
    const fileLabelFromMeta = extractCodeFileLabel(meta);
    const tabLabelFromMeta = extractCodeTabLabel(meta);
    const fromComment = extractLeadingFileComment(code);
    return {
      language,
      tabLabel: tabLabelFromMeta ?? undefined,
      fileLabel: fileLabelFromMeta ?? fromComment.fileLabel ?? undefined,
      code: fromComment.code,
    };
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: (props: ComponentPropsWithoutRef<"a">) => {
          const href = props.href ?? "";
          const rewritten = rewriteMarkdownHref({
            href,
            version,
            currentRelativeFile,
            versionDocs,
          });

          if (rewritten.startsWith("/docs")) {
            return (
              <Link
                href={rewritten}
                className="font-medium text-primary underline underline-offset-2 dark:text-blue-300 dark:hover:text-blue-200"
              >
                {props.children}
              </Link>
            );
          }

          return (
            <a
              {...props}
              href={rewritten}
              className="font-medium text-primary underline underline-offset-2 dark:text-blue-300 dark:hover:text-blue-200"
            />
          );
        },
        h1: (props: ComponentPropsWithoutRef<"h1">) => {
          h1Count += 1;
          const shouldShowLastUpdated =
            h1Count === 1 && lastUpdatedLabel !== null;

          return (
            <>
              <h1
                {...props}
                className="mt-10 text-4xl font-bold tracking-tight first:mt-0"
              />
              {shouldShowLastUpdated ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {lastUpdatedLabel}
                </p>
              ) : null}
            </>
          );
        },
        h2: (props: ComponentPropsWithoutRef<"h2">) => {
          const text = extractText(props.children);
          const id = headingSlugger.slug(text || "section");
          return (
            <h2
              {...props}
              id={id}
              className="group mt-12 flex scroll-mt-6 items-center gap-2 border-t border-border pt-8 text-2xl font-semibold tracking-tight"
            >
              <span>{props.children}</span>
              <DocsHeadingAnchorButton headingId={id} />
            </h2>
          );
        },
        h3: (props: ComponentPropsWithoutRef<"h3">) => {
          const text = extractText(props.children);
          const id = headingSlugger.slug(text || "subsection");
          return (
            <h3
              {...props}
              id={id}
              className="group mt-8 flex scroll-mt-6 items-center gap-2 text-1.5xl font-semibold"
            >
              <span>{props.children}</span>
              <DocsHeadingAnchorButton headingId={id} />
            </h3>
          );
        },
        p: (props: ComponentPropsWithoutRef<"p">) => (
          <p
            {...props}
            className="mb-0 text-md leading-8 text-foreground not-first:mt-5"
          />
        ),
        ul: (props: ComponentPropsWithoutRef<"ul">) => (
          <ul {...props} className="list-disc pl-6 text-md leading-8" />
        ),
        ol: (props: ComponentPropsWithoutRef<"ol">) => (
          <ol {...props} className="list-decimal pl-6 text-md leading-8" />
        ),
        code: ({ className, children, ...rest }) => {
          const props = rest as ComponentPropsWithoutRef<"code"> & {
            node?: MarkdownCodeNode;
          };
          const node = props.node;
          const match = /language-(\w+)/.exec(className ?? "");
          const rawCode = String(children ?? "").replace(/\n$/, "");

          if (!match) {
            return (
              <code
                {...props}
                className={cn(
                  "rounded bg-muted px-1.5 py-0.5 text-[0.9em]",
                  className,
                )}
              >
                {children}
              </code>
            );
          }

          const currentLine = node?.position?.start?.line;
          const group = currentLine
            ? codeTabGroups.get(currentLine)
            : undefined;
          if (group) {
            if (group.index > 0) return null;
            const entries = group.entries.map((entry) =>
              toEntry({
                language: entry.language,
                meta: typeof entry.meta === "string" ? entry.meta : undefined,
                code: entry.code,
              }),
            );
            return <DocsCodeBlock entries={entries} />;
          }

          const meta =
            typeof node?.data?.meta === "string" ? node.data.meta : undefined;
          return (
            <DocsCodeBlock
              entries={[
                toEntry({ language: match[1] ?? "text", meta, code: rawCode }),
              ]}
            />
          );
        },
        pre: ({ children }: ComponentPropsWithoutRef<"pre">) => <>{children}</>,
        table: ({ children }: ComponentPropsWithoutRef<"table">) => (
          <div className="docs-sidebar-scroll my-8 overflow-x-auto rounded-xl border border-border">
            <Table>{children}</Table>
          </div>
        ),
        thead: ({ children }: ComponentPropsWithoutRef<"thead">) => (
          <TableHeader>{children}</TableHeader>
        ),
        tbody: ({ children }: ComponentPropsWithoutRef<"tbody">) => (
          <TableBody>{children}</TableBody>
        ),
        tr: ({ children }: ComponentPropsWithoutRef<"tr">) => (
          <TableRow>{children}</TableRow>
        ),
        th: ({ children }: ComponentPropsWithoutRef<"th">) => (
          <TableHead className="text-sm font-semibold text-foreground">
            {children}
          </TableHead>
        ),
        td: ({ children }: ComponentPropsWithoutRef<"td">) => (
          <TableCell className="align-top text-sm text-foreground">
            {children}
          </TableCell>
        ),
        blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => {
          const text = extractText(props.children).trim();
          const isGoodToKnow = /^good to know:/i.test(text);

          return (
            <blockquote
              {...props}
              className={cn(
                isGoodToKnow
                  ? "my-6 rounded-lg border border-blue-300/70 bg-blue-50/70 px-4 py-3 text-foreground not-italic dark:border-blue-900/70 dark:bg-blue-950/30 [&_p]:my-0 [&_strong:first-child]:text-blue-800 dark:[&_strong:first-child]:text-blue-200"
                  : "border-l-4 border-border pl-4 italic text-foreground",
              )}
            />
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
