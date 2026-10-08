"use client";

import {
  type PromptContent,
  promptReferencePattern,
  promptReferenceToken,
} from "@kortyx/prompts";
import {
  PromptDetailSchema,
  PromptLibrarySchema,
  type PromptStoredVersionSchema,
} from "@kortyx/telemetry-contracts";
import { Extension, type JSONContent } from "@tiptap/core";
import Mention, { type MentionOptions } from "@tiptap/extension-mention";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { SuggestionProps } from "@tiptap/suggestion";
import { exitSuggestion } from "@tiptap/suggestion";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { OVERLAY_LAYERS } from "@/lib/overlay-layers";
import { promptRequest } from "../api/client";

type StoredVersion = z.infer<typeof PromptStoredVersionSchema>;
type Choice = {
  id: string;
  label: string;
  version: number;
  latest: boolean;
  stored: StoredVersion;
};
type ListHandle = { onKeyDown: (event: KeyboardEvent) => boolean };
const ReferenceList = forwardRef<ListHandle, SuggestionProps<Choice, Choice>>(
  function ReferenceList(props, ref) {
    const [selected, setSelected] = useState(0);
    useEffect(() => {
      if (props.items) setSelected(0);
    }, [props.items]);
    useImperativeHandle(ref, () => ({
      onKeyDown(event) {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          setSelected(
            (index) =>
              (index +
                (event.key === "ArrowUp" ? -1 : 1) +
                props.items.length) %
              Math.max(props.items.length, 1),
          );
          return true;
        }
        if (event.key === "Enter") {
          const item = props.items[selected];
          if (item) props.command(item);
          return true;
        }
        return false;
      },
    }));
    return (
      <div
        role="listbox"
        aria-label="Include a prompt"
        className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        style={{ zIndex: OVERLAY_LAYERS.popover }}
      >
        <div className="border-b px-3 py-2 text-xs text-muted-foreground">
          Include a prompt · type @ to choose a version
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {props.items.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={selected === index}
              key={`${item.id}:${item.latest ? "latest" : item.version}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => props.command(item)}
              className={`flex w-full items-start justify-between gap-3 rounded-sm px-2 py-2 text-left text-xs hover:bg-accent ${selected === index ? "bg-accent" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.label}</span>
                <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                  {item.id}
                </span>
              </span>
              <span className="shrink-0 text-muted-foreground">
                {item.latest ? `Latest · v${item.version}` : `v${item.version}`}
              </span>
            </button>
          ))}
          {!props.items.length && (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              {props.loading
                ? "Finding prompts…"
                : "No matching prompt versions"}
            </p>
          )}
        </div>
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Includes the matching message. Latest is pinned to a saved version.
        </p>
      </div>
    );
  },
);

// Decorations style template syntax without changing its text or cursor.
const TemplateVariables = Extension.create({
  name: "templateVariables",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.isText)
                for (const match of node.text!.matchAll(
                  /\{\{\s*[A-Za-z_][A-Za-z0-9_.]*\s*\}\}/g,
                ))
                  decorations.push(
                    Decoration.inline(
                      pos + match.index!,
                      pos + match.index! + match[0].length,
                      {
                        class:
                          "rounded-sm bg-sky-500/10 px-0.5 text-sky-700 dark:text-sky-300",
                        "data-template-variable": "true",
                      },
                    ),
                  );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
function documentFor(
  text: string,
  dependencies: PromptContent["dependencies"],
  names: Record<string, string>,
): JSONContent {
  return {
    type: "doc",
    content: text.split("\n").map((line) => {
      const content: JSONContent[] = [];
      let position = 0;
      for (const match of line.matchAll(promptReferencePattern)) {
        if (match.index! > position)
          content.push({
            type: "text",
            text: line.slice(position, match.index),
          });
        const id = match[1]!;
        content.push({
          type: "mention",
          attrs: {
            id,
            label: names[id] ?? id,
            version: dependencies.find((dep) => dep.id === id)?.version ?? "?",
            hash: dependencies.find((dep) => dep.id === id)?.hash ?? null,
          },
        });
        position = match.index! + match[0].length;
      }
      if (position < line.length)
        content.push({ type: "text", text: line.slice(position) });
      return { type: "paragraph", ...(content.length ? { content } : {}) };
    }),
  };
}
export function PromptEditor({
  id,
  label,
  value,
  role,
  dependencies,
  names,
  ownKey,
  disabled,
  onChange,
  onInclude,
  onValidityChange,
}: {
  id: string;
  label: string;
  value: string;
  role: PromptContent["messages"][number]["role"];
  dependencies: PromptContent["dependencies"];
  names: Record<string, string>;
  ownKey?: string;
  disabled: boolean;
  onChange: (text: string, references: PromptContent["dependencies"]) => void;
  onValidityChange?: (valid: boolean) => void;
  onInclude: (version: StoredVersion) => void;
}) {
  const callbacks = useRef({
    onChange,
    onInclude,
    onValidityChange,
    dependencies,
    names,
    ownKey,
    role,
  });
  callbacks.current = {
    onChange,
    onInclude,
    onValidityChange,
    dependencies,
    names,
    ownKey,
    role,
  };
  const [error, setError] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        link: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        horizontalRule: false,
        trailingNode: false,
      }),
      TemplateVariables,
      Mention.extend<MentionOptions<Choice, Choice>>({
        addAttributes() {
          return {
            ...this.parent?.(),
            version: { default: null },
            hash: { default: null },
          };
        },
      }).configure({
        deleteTriggerWithBackspace: true,
        HTMLAttributes: {
          class:
            "rounded bg-violet-500/10 px-1 py-0.5 text-violet-700 dark:text-violet-300",
          "data-prompt-reference": "true",
        },
        renderText: ({ node }) => promptReferenceToken(node.attrs.id),
        renderHTML: ({ node, options }) => [
          "span",
          options.HTMLAttributes,
          `#${node.attrs.label ?? node.attrs.id}@v${node.attrs.version}`,
        ],
        suggestion: {
          char: "#",
          allowedPrefixes: null,
          allowSpaces: true,
          debounce: 150,
          async items({ query }) {
            try {
              const [search = "", versionQuery] = query.split("@");
              const library = PromptLibrarySchema.parse(
                await promptRequest(
                  `library?search=${encodeURIComponent(search.trim())}`,
                ),
              );
              const choices = await Promise.all(
                library.assets
                  .filter((asset) => asset.key !== callbacks.current.ownKey)
                  .slice(0, 5)
                  .map(async (asset) => {
                    try {
                      const detail = PromptDetailSchema.parse(
                        await promptRequest(
                          `assets/${asset.id}${versionQuery && /^v?\d+$/i.test(versionQuery) ? `?version=${Number(versionQuery.replace(/^v/i, ""))}` : ""}`,
                        ),
                      );
                      const compatible = detail.versions.filter((version) =>
                        version.content.messages.some(
                          (message) => message.role === callbacks.current.role,
                        ),
                      );
                      const latest = compatible.find(
                        (version) => version.version === asset.latestVersion,
                      );
                      const items: Choice[] = latest
                        ? [
                            {
                              id: asset.key,
                              label: asset.name,
                              version: latest.version,
                              latest: true,
                              stored: latest,
                            },
                          ]
                        : [];
                      if (versionQuery !== undefined)
                        items.push(
                          ...compatible.map((stored) => ({
                            id: asset.key,
                            label: asset.name,
                            version: stored.version,
                            latest: false,
                            stored,
                          })),
                        );
                      return items.filter(
                        (item) =>
                          !versionQuery ||
                          (item.latest ? "latest" : `v${item.version}`)
                            .toLowerCase()
                            .startsWith(versionQuery.toLowerCase()),
                      );
                    } catch {
                      // A requested version may exist on only some search matches.
                      return [];
                    }
                  }),
              );
              return choices.flat();
            } catch {
              return [];
            }
          },
          command({ editor, range, props }) {
            try {
              callbacks.current.onInclude(props.stored);
              setError("");
              editor
                .chain()
                .focus()
                .insertContentAt(range, [
                  {
                    type: "mention",
                    attrs: {
                      id: props.id,
                      label: props.label,
                      version: props.version,
                      hash: props.stored.hash,
                    },
                  },
                  { type: "text", text: " " },
                ])
                .run();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not include this prompt.",
              );
              exitSuggestion(editor.view);
            }
          },
          render() {
            let component: ReactRenderer<ListHandle> | undefined;
            let unmount: (() => void) | undefined;
            return {
              onStart(props) {
                component = new ReactRenderer(ReferenceList, {
                  props,
                  editor: props.editor,
                });
                component.element.style.zIndex = String(OVERLAY_LAYERS.popover);
                unmount = props.mount(component.element);
              },
              onUpdate(props) {
                component?.updateProps(props);
              },
              onKeyDown({ event, view }) {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  exitSuggestion(view);
                  return true;
                }
                return component?.ref?.onKeyDown(event) ?? false;
              },
              onExit() {
                unmount?.();
                component?.destroy();
              },
            };
          },
        },
      }),
    ],
    content: documentFor(value, dependencies, names),
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        spellcheck: "false",
        class:
          "min-h-32 w-full whitespace-pre-wrap break-words rounded-md border bg-background px-3 py-2 font-mono text-xs leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 [&_p]:m-0",
      },
      handlePaste(view, event) {
        // Prompt text is portable plain text. Pasting HTML never changes it into
        // formatting, executable markup, or an arbitrary mention node.
        const text = event.clipboardData?.getData("text/plain");
        if (text === undefined) return false;
        event.preventDefault();
        const { from, to } = view.state.selection;
        editor?.commands.insertContentAt(
          { from, to },
          documentFor(
            text,
            callbacks.current.dependencies,
            callbacks.current.names,
          ).content!,
          { parseOptions: { preserveWhitespace: "full" } },
        );
        return true;
      },
    },
    onUpdate({ editor }) {
      try {
        // Native undo/redo restores node attributes as well as text. Keep the
        // exact dependency pin with the mention instead of losing it on delete.
        const references = new Map<
          string,
          PromptContent["dependencies"][number]
        >();
        editor.state.doc.descendants((node) => {
          if (node.type.name !== "mention") return;
          const { id, version, hash } = node.attrs;
          if (
            typeof id !== "string" ||
            typeof version !== "number" ||
            typeof hash !== "string"
          )
            throw new Error("Choose a saved version for each included prompt.");
          const existing = references.get(id);
          if (
            existing &&
            (existing.version !== version || existing.hash !== hash)
          )
            throw new Error(
              "An included prompt must use the same version throughout this message.",
            );
          references.set(id, { id, version, hash });
        });
        callbacks.current.onChange(editor.getText({ blockSeparator: "\n" }), [
          ...references.values(),
        ]);
        setError("");
        callbacks.current.onValidityChange?.(true);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not update included prompts.",
        );
        callbacks.current.onValidityChange?.(false);
      }
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
    editor?.view.dom.setAttribute("aria-readonly", String(disabled));
  }, [editor, disabled]);
  useEffect(() => {
    if (editor && editor.getText({ blockSeparator: "\n" }) !== value)
      editor.commands.setContent(documentFor(value, dependencies, names), {
        emitUpdate: false,
      });
  }, [editor, value, dependencies, names]);
  return (
    <div className="space-y-2">
      <EditorContent editor={editor} />
      {!disabled && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            <span className="text-sky-700 dark:text-sky-300">
              {"{{variable}}"}
            </span>{" "}
            fills from code ·{" "}
            <span className="text-violet-700 dark:text-violet-300">
              #prompt
            </span>{" "}
            includes a saved prompt
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 text-[11px]"
            onClick={() => editor?.chain().focus().insertContent("#").run()}
          >
            Include prompt
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
