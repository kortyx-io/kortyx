"use client";

import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  isolateHistory,
} from "@codemirror/commands";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { linter } from "@codemirror/lint";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import styles from "./json-code-editor.module.css";

const highlighting = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--json-key)" },
  { tag: tags.string, color: "var(--json-string)" },
  { tag: tags.number, color: "var(--json-number)" },
  { tag: [tags.bool, tags.null], color: "var(--json-literal)" },
  { tag: [tags.bracket, tags.separator], color: "var(--muted-foreground)" },
]);
const externalValue = Annotation.define<boolean>();
const theme = EditorView.theme({
  "&": {
    color: "var(--foreground)",
    backgroundColor: "var(--background)",
    fontSize: "12px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-geist-mono), monospace",
    lineHeight: "1.8",
    overflow: "auto",
    maxHeight: "24rem",
  },
  ".cm-content": {
    minHeight: "8rem",
    padding: "10px 0",
    caretColor: "var(--foreground)",
  },
  ".cm-line": { padding: "0 12px" },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)",
    border: "none",
    paddingRight: "4px",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLine, &.cm-focused .cm-activeLineGutter": {
    backgroundColor: "var(--muted)",
  },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
    { backgroundColor: "var(--json-selection)" },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--accent)",
    outline: "1px solid var(--ring)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    borderColor: "var(--border)",
    fontFamily: "var(--font-geist-sans), sans-serif",
  },
});

type Props = {
  id: string;
  labelId: string;
  descriptionId?: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  invalid?: boolean;
};

const configuration = (
  value: Pick<
    Props,
    "id" | "labelId" | "descriptionId" | "readOnly" | "invalid"
  >,
) => [
  EditorState.readOnly.of(Boolean(value.readOnly)),
  EditorView.editable.of(!value.readOnly),
  EditorView.contentAttributes.of({
    id: value.id,
    role: "textbox",
    "aria-labelledby": value.labelId,
    ...(value.descriptionId ? { "aria-describedby": value.descriptionId } : {}),
    "aria-multiline": "true",
    "aria-readonly": String(Boolean(value.readOnly)),
    "aria-invalid": String(Boolean(value.invalid)),
    tabindex: "0",
    spellcheck: "false",
  }),
  ...(value.readOnly
    ? []
    : [highlightActiveLine(), highlightActiveLineGutter()]),
];

/** Plain JSON in and out; CodeMirror owns editing, history and syntax state. */
export function JsonCodeEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const options = useRef(new Compartment());
  const current = useRef(props);
  current.current = props;
  // Create once; prop changes reconfigure the view without losing cursor/undo.
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: current.current.value,
        extensions: [
          json(),
          lineNumbers(),
          foldGutter(),
          history(),
          drawSelection(),
          highlightSpecialChars(),
          bracketMatching(),
          closeBrackets(),
          indentOnInput(),
          indentUnit.of("  "),
          EditorView.lineWrapping,
          syntaxHighlighting(highlighting),
          linter(jsonParseLinter()),
          // Keep Tab available for normal form navigation. Native Mod-[ / Mod-]
          // indent selections, and Enter indents new lines automatically.
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
          ]),
          theme,
          options.current.of(configuration(current.current)),
          EditorView.updateListener.of((update) => {
            // Controlled value replacements are already owned by React. Echoing
            // them as edits can race another field's update and reset its value.
            if (
              update.docChanged &&
              update.transactions.some(
                (transaction) =>
                  transaction.docChanged &&
                  !transaction.annotation(externalValue),
              )
            )
              current.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    editor.current = view;
    return () => {
      editor.current = null;
      view.destroy();
    };
  }, []);
  useEffect(() => {
    editor.current?.dispatch({
      effects: options.current.reconfigure(
        configuration({
          id: props.id,
          labelId: props.labelId,
          descriptionId: props.descriptionId,
          readOnly: props.readOnly,
          invalid: props.invalid,
        }),
      ),
    });
  }, [
    props.id,
    props.labelId,
    props.descriptionId,
    props.readOnly,
    props.invalid,
  ]);
  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== props.value)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: props.value },
        annotations: [isolateHistory.of("full"), externalValue.of(true)],
      });
  }, [props.value]);
  return <div ref={host} className={styles.root} data-json-editor="true" />;
}
