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
};

export function DocsMarkdownContent(props: DocsMarkdownContentProps) {
  const { content, version, currentRelativeFile, versionDocs } = props;
  const headingSlugger = new GithubSlugger();
  const codeTabGroups = parseCodeTabGroups(content);

  const toEntry = (args: {
    language: string;
    meta?: string;
    code: string;
  }): DocsCodeBlockEntry => {
    const { language, meta, code } = args;
    const fileLabelFromMeta = extractCodeFileLabel(meta);
    const fromComment = extractLeadingFileComment(code);
    return {
      language,
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
        h1: (props: ComponentPropsWithoutRef<"h1">) => (
          <h1
            {...props}
            className="mt-10 text-4xl font-bold tracking-tight first:mt-0"
          />
        ),
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
          <div className="my-8 overflow-x-auto rounded-xl border border-border">
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
        blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
          <blockquote
            {...props}
            className="border-l-4 border-border pl-4 italic text-foreground"
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
