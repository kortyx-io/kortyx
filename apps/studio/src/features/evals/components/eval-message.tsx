"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Reading a response should not require choosing a payload representation. */
export function EvalMessage({ text }: { text: string }) {
  return (
    <div className="min-w-0 overflow-x-auto text-sm leading-relaxed [overflow-wrap:anywhere] [&_p]:whitespace-pre-wrap [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-xs [&_code]:font-mono [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h1]:my-3 [&_h1]:font-semibold [&_h2]:my-3 [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-semibold [&_table]:my-3 [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_a]:text-info [&_a]:underline">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
