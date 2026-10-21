export const promptMessageClassName =
  "min-h-32 w-full whitespace-pre-wrap break-words rounded-md border bg-background px-3 py-2 font-mono text-xs leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 [&_p]:m-0";
export const promptVariableClassName =
  "rounded-sm bg-sky-500/10 px-0.5 text-sky-700 dark:text-sky-300";
export const promptVariablePattern = /\{\{\s*[A-Za-z_][A-Za-z0-9_.]*\s*\}\}/g;

function highlight(text: string, offset: number, matches: [number, number][]) {
  const parts = [];
  let position = 0;
  for (const [start, end] of matches) {
    const next = Math.max(0, start - offset);
    const until = Math.min(text.length, end - offset);
    if (next >= until) continue;
    parts.push(
      text.slice(position, next),
      <mark
        key={next}
        className="rounded-sm bg-yellow-300/70 text-neutral-950 dark:bg-yellow-300/30 dark:text-yellow-100"
      >
        {text.slice(next, until)}
      </mark>,
    );
    position = until;
  }
  parts.push(text.slice(position));
  return parts;
}

/** Read-only message content using the same visual tokens as the prompt editor. */
export function PromptMessagePreview({
  label,
  value,
  search = "",
}: {
  label: string;
  value: string;
  search?: string;
}) {
  const query = search.trim().toLocaleLowerCase();
  const matches: [number, number][] = [];
  if (query) {
    const lower = value.toLocaleLowerCase();
    let next = lower.indexOf(query);
    while (next >= 0) {
      matches.push([next, next + query.length]);
      next = lower.indexOf(query, next + query.length);
    }
  }
  const parts = [];
  let position = 0;
  for (const match of value.matchAll(promptVariablePattern)) {
    parts.push(
      highlight(value.slice(position, match.index), position, matches),
    );
    parts.push(
      <span
        key={match.index}
        data-template-variable="true"
        className={promptVariableClassName}
      >
        {highlight(match[0], match.index, matches)}
      </span>,
    );
    position = match.index + match[0].length;
  }
  parts.push(highlight(value.slice(position), position, matches));
  return (
    <section
      data-prompt-message
      aria-label={label}
      className="min-w-0 space-y-2"
    >
      <h3 className="text-xs font-medium">{label}</h3>
      <pre className={`${promptMessageClassName} [overflow-wrap:anywhere]`}>
        {parts}
      </pre>
    </section>
  );
}
