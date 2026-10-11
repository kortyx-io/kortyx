import {
  type PromptContent,
  PromptError,
  type PromptVersion,
} from "./contracts";

// Display names are editable; persisted references use stable keys and exact
// versions/hashes in the existing dependency manifest.
export const promptReferencePattern =
  /\[\[prompt:([a-zA-Z0-9][a-zA-Z0-9_./-]*)\]\]/g;
export function promptReferenceToken(id: string) {
  return `[[prompt:${id}]]`;
}
export function promptReferences(content: PromptContent): string[] {
  return [
    ...new Set(
      content.messages.flatMap((message) =>
        [...message.content.matchAll(promptReferencePattern)].map(
          (match) => match[1]!,
        ),
      ),
    ),
  ];
}
export function expandPromptMessages(
  root: PromptVersion,
  versions: Readonly<Record<string, PromptVersion>> = {},
): { messages: PromptContent["messages"]; used: PromptVersion[] } {
  const used = new Map<string, PromptVersion>();
  const cache = new Map<string, string>();
  const expand = (
    owner: PromptVersion,
    text: string,
    role: PromptContent["messages"][number]["role"],
    active: Set<string>,
  ): string => {
    const parts: string[] = [];
    let size = 0,
      position = 0;
    const append = (part: string) => {
      size += part.length;
      if (size > 200_000)
        throw new PromptError(
          "PROMPT_REFERENCE_LIMIT",
          "An expanded message cannot exceed 200,000 characters.",
        );
      parts.push(part);
    };
    for (const match of text.matchAll(promptReferencePattern)) {
      append(text.slice(position, match.index));
      position = match.index! + match[0].length;
      const id = match[1]!;
      const dependency = owner.content.dependencies.find(
        (item) => item.id === id,
      );
      const child = versions[id];
      if (
        !dependency ||
        !child ||
        child.version !== dependency.version ||
        child.hash !== dependency.hash
      )
        throw new PromptError(
          "PROMPT_REFERENCE_MISSING",
          `Include an exact dependency for referenced prompt ${id}.`,
        );
      if (active.has(id) || active.size >= 200)
        throw new PromptError(
          "PROMPT_DEPENDENCY_CYCLE",
          `Prompt reference cycle at ${id}.`,
        );
      const messages = child.content.messages.filter(
        (message) => message.role === role,
      );
      if (!messages.length)
        throw new PromptError(
          "PROMPT_REFERENCE_ROLE",
          `${id} has no ${role} message to include.`,
        );
      used.set(id, child);
      const cacheKey = `${id}@${child.version}:${role}`;
      let included = cache.get(cacheKey);
      if (included === undefined) {
        const next = new Set(active).add(id);
        const chunks: string[] = [];
        let length = 0;
        for (const message of messages) {
          const chunk = expand(child, message.content, role, next);
          length += chunk.length + (chunks.length ? 2 : 0);
          if (length > 200_000)
            throw new PromptError(
              "PROMPT_REFERENCE_LIMIT",
              "An expanded message cannot exceed 200,000 characters.",
            );
          chunks.push(chunk);
        }
        included = chunks.join("\n\n");
        cache.set(cacheKey, included);
      }
      append(included);
    }
    append(text.slice(position));
    return parts.join("");
  };
  return {
    messages: root.content.messages.map((message) => ({
      ...message,
      content: expand(root, message.content, message.role, new Set([root.id])),
    })),
    used: [...used.values()],
  };
}
