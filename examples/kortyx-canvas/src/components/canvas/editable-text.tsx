"use client";

import { useEffect, useRef, useState } from "react";

type EditableTextProps = {
  value: string;
  onCommit: (next: string) => void;
  /** Visual variant — controls font weight / size. */
  variant?: "title" | "body" | "small";
  /** Render as an auto-growing textarea instead of a single-line input. */
  multiline?: boolean;
  placeholder?: string;
  /** Extra classes appended to the field. */
  className?: string;
  ariaLabel: string;
};

const VARIANT_CLASSES: Record<
  NonNullable<EditableTextProps["variant"]>,
  string
> = {
  title: "text-base font-semibold leading-tight text-card-foreground",
  body: "text-sm leading-relaxed text-card-foreground",
  small: "text-xs leading-relaxed text-muted-foreground",
};

const COMMIT_DEBOUNCE_MS = 400;

/**
 * Always-editable inline text. Renders as a borderless, transparent
 * input/textarea styled to match the surrounding card text — the field is
 * indistinguishable from static text until the user focuses it. Edits are
 * debounced (~400ms) and flushed on blur so streaming context isn't hit on
 * every keystroke.
 */
export function EditableText({
  value,
  onCommit,
  variant = "body",
  multiline = false,
  placeholder,
  className,
  ariaLabel,
}: EditableTextProps) {
  const [draft, setDraft] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocusedRef = useRef(false);
  const lastCommittedRef = useRef(value);

  useEffect(() => {
    lastCommittedRef.current = value;
    // Pull in external updates (e.g. streaming) without clobbering an
    // in-progress edit.
    if (!isFocusedRef.current) {
      setDraft(value);
    }
  }, [value]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const commit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed === lastCommittedRef.current.trim()) return;
    lastCommittedRef.current = trimmed;
    onCommit(trimmed);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const next = e.target.value;
    setDraft(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commit(next), COMMIT_DEBOUNCE_MS);
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    commit(draft);
  };

  const variantClass = VARIANT_CLASSES[variant];
  const baseClass =
    "block w-full resize-none border-0 bg-transparent p-0 m-0 outline-none rounded-sm placeholder:italic placeholder:text-muted-foreground/70 focus:outline-none focus-visible:outline-none";

  if (multiline) {
    return (
      <textarea
        aria-label={ariaLabel}
        data-quote-source=""
        value={draft}
        placeholder={placeholder}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        rows={1}
        style={{ fontFamily: "inherit" }}
        className={`${baseClass} field-sizing-content ${variantClass} ${className ?? ""}`}
      />
    );
  }

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      data-quote-source=""
      value={draft}
      placeholder={placeholder}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={{ fontFamily: "inherit" }}
      className={`${baseClass} ${variantClass} ${className ?? ""}`}
    />
  );
}
